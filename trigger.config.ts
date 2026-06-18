import { defineConfig } from "@trigger.dev/sdk";
import { pythonExtension } from "@trigger.dev/python/extension";

const project = process.env.TRIGGER_PROJECT_REF ?? "proj_hfkmpivzdhbvbvfffcsg";

export default defineConfig({
  project,
  dirs: ["./trigger"],
  runtime: "node-22",
  maxDuration: 1800,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 2,
      minTimeoutInMs: 30_000,
      maxTimeoutInMs: 300_000,
      factor: 2,
      randomize: true,
    },
  },
  build: {
    external: ["cpu-features", "ssh2"],
    extensions: [
      pythonExtension({
        scripts: ["./scripts/**/*.py"],
      }),
    ],
  },
});
