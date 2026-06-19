import fs from "node:fs";
import vm from "node:vm";

const ARTICLES_PATH = process.env.ARTICLES_PATH ?? "articles.js";
const MIN_ARTICLE_COUNT = Number.parseInt(process.env.MIN_ARTICLE_COUNT ?? "200", 10);
const FEISHU_WIKI_PREFIX = "https://ycn3zdw6f1p7.feishu.cn/wiki/";

function loadArticles(path) {
  const source = fs.readFileSync(path, "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox, { filename: path });
  return sandbox.window.ARTICLES;
}

function articleLabel(article, index) {
  const title = String(article?.fullTitle || article?.title || "").trim();
  return title ? `#${index} ${title}` : `#${index}`;
}

function validateArticle(article, index, seenUrls) {
  const failures = [];
  const requiredFields = ["title", "fullTitle", "date", "month", "url", "theme"];
  const label = articleLabel(article, index);

  if (!article || typeof article !== "object" || Array.isArray(article)) {
    return [`${label} must be an object`];
  }

  for (const field of requiredFields) {
    if (!String(article[field] ?? "").trim()) {
      failures.push(`${label} missing ${field}`);
    }
  }

  const url = String(article.url ?? "").trim();
  if (url && !url.startsWith(FEISHU_WIKI_PREFIX)) {
    failures.push(`${label} invalid Feishu wiki URL: ${url}`);
  }

  if (url) {
    if (seenUrls.has(url)) {
      failures.push(`${label} duplicate URL: ${url}`);
    }
    seenUrls.add(url);
  }

  if (!/^\d{4} 年 \d{1,2} 月 \d{1,2} 日$/.test(String(article.date ?? ""))) {
    failures.push(`${label} invalid date format: ${article.date}`);
  }

  if (!/^\d{4} 年 \d{1,2} 月$/.test(String(article.month ?? ""))) {
    failures.push(`${label} invalid month format: ${article.month}`);
  }

  if (!Number.isInteger(article.images) || article.images < 0) {
    failures.push(`${label} images must be a non-negative integer`);
  }

  return failures;
}

const articles = loadArticles(ARTICLES_PATH);
if (!Array.isArray(articles)) {
  throw new Error("window.ARTICLES must be an array");
}

if (articles.length < MIN_ARTICLE_COUNT) {
  throw new Error(
    `window.ARTICLES has ${articles.length} articles, below MIN_ARTICLE_COUNT=${MIN_ARTICLE_COUNT}`,
  );
}

const failures = [];
const seenUrls = new Set();

for (const [index, article] of articles.entries()) {
  failures.push(...validateArticle(article, index, seenUrls));
}

if (failures.length) {
  console.error(failures.slice(0, 80).join("\n"));
  throw new Error(`${failures.length} article validation errors`);
}

console.log(`Validated ${articles.length} articles from ${ARTICLES_PATH}.`);
