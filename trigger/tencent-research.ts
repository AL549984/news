import { python } from "@trigger.dev/python";
import { logger, schedules } from "@trigger.dev/sdk";
import { access, readFile } from "node:fs/promises";
import { Client, type ConnectConfig } from "ssh2";

const DEFAULT_REPOSITORY = "AL549984/news";
const DEFAULT_BRANCH = "main";
const DEFAULT_SYNC_SCRIPT = "./scripts/sync_tencent_research_wechat_to_feishu_wiki.py";
const DEFAULT_EXPORT_SCRIPT = "./scripts/export_tencent_research_site_articles.py";
const DEFAULT_STATE_PATH = "./data/tencent_research_wechat_wiki/state.json";
const DEFAULT_ARTICLES_PATH = "./articles.js";
const DEFAULT_HERMES_REMOTE_COMMAND =
  "cd /home/ubuntu/.hermes/profiles/news && bash scripts/sync_tencent_research_wechat_to_feishu_wiki_daily.sh";
const DEFAULT_HERMES_POLL_COMMAND =
  "cd /home/ubuntu/.hermes/profiles/news && /usr/bin/python3 scripts/tencent_research_realtime_watcher.py --once --quiet-noop --deploy-timeout 600 --deploy-cmd /usr/bin/python3 scripts/push_tencent_research_site_to_github.py";

type GithubFile = {
  sha: string;
  content: string;
  encoding: string;
};

type PublishResult =
  | { status: "skipped"; reason: string }
  | { status: "updated"; commitSha?: string; htmlUrl?: string };

type RemoteSyncResult = {
  status: "remote_synced";
  host: string;
  command: string;
  exitCode?: number | null;
  stdoutTail?: string;
  stderrTail?: string;
};

type SyncResult = PublishResult | RemoteSyncResult;

type GithubTarget = {
  token: string;
  repository: string;
  branch: string;
  remotePath: string;
};

type HermesRemoteConfig = {
  host: string;
  username: string;
  port: number;
  password?: string;
  privateKey?: string;
  command: string;
  timeoutMs: number;
};

export const syncTencentResearchSite = schedules.task({
  id: "sync-tencent-research-site",
  cron: {
    pattern: process.env.TENCENT_RESEARCH_CRON ?? "0 19 * * *",
    timezone: process.env.TENCENT_RESEARCH_TIMEZONE ?? "Asia/Shanghai",
    environments: ["PRODUCTION"],
  },
  run: async (payload): Promise<SyncResult> => {
    logger.info("Starting Tencent Research site sync", {
      scheduledAt: payload.timestamp,
      timezone: payload.timezone,
    });

    const hermesRemote = getHermesRemoteConfig();
    if (hermesRemote) {
      return runHermesRemoteSync(hermesRemote);
    }

    await runPythonScriptIfPresent(
      process.env.TENCENT_RESEARCH_SYNC_SCRIPT ?? DEFAULT_SYNC_SCRIPT,
      "wechat-to-feishu sync"
    );

    const statePath = process.env.TENCENT_RESEARCH_STATE_PATH ?? DEFAULT_STATE_PATH;
    const exportScriptPath = process.env.TENCENT_RESEARCH_EXPORT_SCRIPT ?? DEFAULT_EXPORT_SCRIPT;
    if ((await fileExists(statePath)) || process.env.TENCENT_RESEARCH_FORCE_EXPORT === "1") {
      await runPythonScriptIfPresent(exportScriptPath, "state-to-articles export");
    } else {
      logger.warn("Skipping state-to-articles export; state file not found", { statePath });
    }

    const articlesPath = process.env.TENCENT_RESEARCH_ARTICLES_PATH ?? DEFAULT_ARTICLES_PATH;
    if (!(await fileExists(articlesPath))) {
      return verifyRemoteArticles(articlesPath);
    }

    const articlesJs = await readFile(articlesPath, "utf8");
    return publishArticlesToGitHub(articlesJs, articlesPath);
  },
});

export const pollTencentResearchSite = schedules.task({
  id: "poll-tencent-research-site",
  cron: {
    pattern: process.env.TENCENT_RESEARCH_POLL_CRON ?? "*/5 * * * *",
    timezone: process.env.TENCENT_RESEARCH_TIMEZONE ?? "Asia/Shanghai",
    environments: ["PRODUCTION"],
  },
  run: async (payload): Promise<SyncResult> => {
    logger.info("Polling Tencent Research site for new articles", {
      scheduledAt: payload.timestamp,
      timezone: payload.timezone,
    });

    const hermesRemote = getHermesRemoteConfig({
      command: process.env.HERMES_REMOTE_POLL_COMMAND?.trim() || DEFAULT_HERMES_POLL_COMMAND,
      timeoutMs: parseInteger(process.env.HERMES_POLL_TIMEOUT_MS, 10 * 60 * 1000),
    });
    if (hermesRemote) {
      return runHermesRemoteSync(hermesRemote);
    }

    return {
      status: "skipped",
      reason: "Hermes SSH is not configured; poll task only runs through Hermes.",
    };
  },
});

function getHermesRemoteConfig(
  overrides: Partial<Pick<HermesRemoteConfig, "command" | "timeoutMs">> = {}
): HermesRemoteConfig | null {
  const host = process.env.HERMES_SSH_HOST?.trim();
  if (!host) {
    return null;
  }

  const password = process.env.HERMES_SSH_PASSWORD;
  const privateKey = process.env.HERMES_SSH_PRIVATE_KEY;
  if (!password && !privateKey) {
    logger.warn("Hermes SSH host is set, but neither password nor private key is configured");
    return null;
  }

  return {
    host,
    username: process.env.HERMES_SSH_USER?.trim() || "ubuntu",
    port: parseInteger(process.env.HERMES_SSH_PORT, 22),
    password,
    privateKey,
    command: overrides.command ?? process.env.HERMES_REMOTE_COMMAND?.trim() ?? DEFAULT_HERMES_REMOTE_COMMAND,
    timeoutMs: overrides.timeoutMs ?? parseInteger(process.env.HERMES_SSH_TIMEOUT_MS, 20 * 60 * 1000),
  };
}

function runHermesRemoteSync(config: HermesRemoteConfig): Promise<RemoteSyncResult> {
  logger.info("Running Tencent Research sync on Hermes over SSH", {
    host: config.host,
    username: config.username,
    port: config.port,
    command: config.command,
  });

  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;
    let stdout = "";
    let stderr = "";

    const settle = <T>(fn: (value: T) => void, value: T) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      conn.end();
      fn(value);
    };

    const timeout = setTimeout(() => {
      settle(reject, new Error(`Hermes remote sync timed out after ${config.timeoutMs}ms`));
    }, config.timeoutMs);

    const connectConfig: ConnectConfig = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: Math.min(config.timeoutMs, 60_000),
    };

    if (config.password) {
      connectConfig.password = config.password;
    }
    if (config.privateKey) {
      connectConfig.privateKey = config.privateKey;
    }

    conn
      .on("ready", () => {
        conn.exec(config.command, (error, stream) => {
          if (error) {
            settle(reject, error);
            return;
          }

          stream
            .on("close", (code: number | null, signal: string | null) => {
              const stdoutTail = tail(stdout);
              const stderrTail = tail(stderr);
              logger.info("Hermes remote sync finished", {
                host: config.host,
                exitCode: code,
                signal,
                stdoutTail,
                stderrTail,
              });

              if (code !== 0 && code !== null) {
                settle(
                  reject,
                  new Error(
                    `Hermes remote sync failed with exit code ${code}: ${tail(stderr || stdout, 1200)}`
                  )
                );
                return;
              }

              settle(resolve, {
                status: "remote_synced",
                host: config.host,
                command: config.command,
                exitCode: code,
                stdoutTail,
                stderrTail,
              });
            })
            .on("data", (data: Buffer) => {
              stdout += data.toString("utf8");
            });

          stream.stderr.on("data", (data: Buffer) => {
            stderr += data.toString("utf8");
          });
        });
      })
      .on("error", (error) => {
        settle(reject, error);
      })
      .connect(connectConfig);
  });
}

async function runPythonScriptIfPresent(scriptPath: string, label: string) {
  if (!(await fileExists(scriptPath))) {
    logger.warn(`Skipping ${label}; script not found`, { scriptPath });
    return;
  }

  logger.info(`Running ${label}`, { scriptPath });
  const result = await python.runScript(scriptPath, [], {
    env: process.env,
    throwOnError: false,
  });

  if (result.stdout.trim()) {
    logger.info(`${label} stdout`, { stdout: result.stdout.slice(-8000) });
  }

  if (result.stderr.trim()) {
    logger.warn(`${label} stderr`, { stderr: result.stderr.slice(-8000) });
  }

  if (result.exitCode !== 0) {
    throw new Error(`${label} failed with exit code ${result.exitCode ?? "unknown"}`);
  }
}

async function publishArticlesToGitHub(content: string, filePath: string): Promise<PublishResult> {
  const target = getGithubTarget(filePath);
  if (!target) {
    return {
      status: "skipped",
      reason: "GITHUB_TOKEN is not set; generated articles.js locally but did not publish.",
    };
  }

  const remote = await getGithubFile(
    target.token,
    target.repository,
    target.remotePath,
    target.branch
  );
  const remoteContent =
    remote?.encoding === "base64" ? Buffer.from(remote.content, "base64").toString("utf8") : "";

  if (remoteContent === content) {
    return { status: "skipped", reason: "articles.js is already up to date on GitHub." };
  }

  const message =
    process.env.GITHUB_COMMIT_MESSAGE ??
    `chore: update Tencent Research articles ${new Date().toISOString().slice(0, 10)}`;

  const updated = await putGithubFile(target.token, target.repository, target.remotePath, target.branch, {
    message,
    content,
    sha: remote?.sha,
  });

  logger.info("Published articles.js to GitHub", {
    repository: target.repository,
    branch: target.branch,
    remotePath: target.remotePath,
    commitSha: updated.commit?.sha,
  });

  return {
    status: "updated",
    commitSha: updated.commit?.sha,
    htmlUrl: updated.content?.html_url,
  };
}

async function verifyRemoteArticles(filePath: string): Promise<PublishResult> {
  const target = getGithubTarget(filePath);
  if (!target) {
    return {
      status: "skipped",
      reason: "Local articles.js was not found and GITHUB_TOKEN is not set; nothing to publish.",
    };
  }

  const remote = await getGithubFile(
    target.token,
    target.repository,
    target.remotePath,
    target.branch
  );
  if (!remote) {
    throw new Error(`Local articles.js was not found and GitHub file is missing: ${target.remotePath}`);
  }

  logger.info("Local articles.js not found; verified GitHub article file instead", {
    repository: target.repository,
    branch: target.branch,
    remotePath: target.remotePath,
    sha: remote.sha,
  });

  return {
    status: "skipped",
    reason: "Local articles.js was not bundled in Trigger; verified GitHub articles.js is reachable.",
  };
}

function getGithubTarget(filePath: string): GithubTarget | null {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return null;
  }

  return {
    token,
    repository: process.env.GITHUB_REPOSITORY ?? DEFAULT_REPOSITORY,
    branch: process.env.GITHUB_BRANCH ?? DEFAULT_BRANCH,
    remotePath: process.env.GITHUB_ARTICLES_PATH ?? filePath.replace(/^\.\//, ""),
  };
}

async function getGithubFile(
  token: string,
  repository: string,
  path: string,
  branch: string
): Promise<GithubFile | null> {
  const response = await githubFetch(
    token,
    repository,
    `/contents/${encodeURIComponentPath(path)}?ref=${encodeURIComponent(branch)}`
  );

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`GitHub GET failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as GithubFile | GithubFile[];
  if (Array.isArray(data)) {
    throw new Error(`GitHub path is a directory, expected a file: ${path}`);
  }

  return data;
}

async function putGithubFile(
  token: string,
  repository: string,
  path: string,
  branch: string,
  options: { message: string; content: string; sha?: string }
) {
  const body: Record<string, unknown> = {
    message: options.message,
    content: Buffer.from(options.content, "utf8").toString("base64"),
    branch,
  };

  if (options.sha) {
    body.sha = options.sha;
  }

  const response = await githubFetch(token, repository, `/contents/${encodeURIComponentPath(path)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`GitHub PUT failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as {
    content?: { html_url?: string };
    commit?: { sha?: string };
  };
}

function githubFetch(token: string, repository: string, path: string, init: RequestInit = {}) {
  return fetch(`https://api.github.com/repos/${repository}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });
}

function encodeURIComponentPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function parseInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function tail(value: string, maxLength = 8000) {
  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(-maxLength);
}

async function fileExists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
