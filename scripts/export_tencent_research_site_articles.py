#!/usr/bin/env python3
"""Export Tencent Research state.json records to the static site's articles.js."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
STATE_PATH = Path(os.environ.get("TENCENT_RESEARCH_STATE_PATH", ROOT / "data/tencent_research_wechat_wiki/state.json"))
OUTPUT_PATH = Path(os.environ.get("TENCENT_RESEARCH_ARTICLES_PATH", ROOT / "articles.js"))

THEMES = {
    "AI 技术与 Agent": ("大模型", "agent", "智能体", "agi", "coding", "具身", "算力", "模型", "ai速递", "top50"),
    "产业与商业化": ("产业", "商业", "企业", "token", "经济", "市场", "组织", "投资"),
    "AI 治理与社会": ("治理", "伦理", "安全", "社会", "信任", "监管", "人类", "主体性"),
    "文化与内容创新": ("文化", "内容", "艺术", "音乐", "影视", "ip", "游戏", "创作"),
    "教育与公共服务": ("教育", "健康", "医疗", "就业", "公共服务", "青少年", "老龄"),
}


def main() -> None:
    if not STATE_PATH.exists():
        raise SystemExit(f"state file not found: {STATE_PATH}")

    state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    articles = [article for article in records_from_state(state) if article.get("title") and article.get("url")]
    articles.sort(key=lambda item: date_key(item.get("date", "")), reverse=False)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        "window.ARTICLES = " + json.dumps(articles, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    print(f"exported {len(articles)} articles to {OUTPUT_PATH}")


def records_from_state(state: Any) -> list[dict[str, Any]]:
    raw_records = collect_candidate_records(state)
    seen: set[str] = set()
    articles: list[dict[str, Any]] = []

    for record in raw_records:
        article = normalize_record(record)
        identity = article.get("url") or article.get("fullTitle") or article.get("title")
        if not identity or identity in seen:
            continue
        seen.add(identity)
        articles.append(article)

    return articles


def collect_candidate_records(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        records: list[dict[str, Any]] = []
        for item in value:
            records.extend(collect_candidate_records(item))
        return records

    if not isinstance(value, dict):
        return []

    if looks_like_article(value):
        return [value]

    records: list[dict[str, Any]] = []
    for key in ("articles", "items", "records", "documents", "docs", "entries", "synced", "pages"):
        if key in value:
            records.extend(collect_candidate_records(value[key]))

    if not records:
        for item in value.values():
            records.extend(collect_candidate_records(item))

    return records


def looks_like_article(record: dict[str, Any]) -> bool:
    keys = {key.lower() for key in record}
    has_title = bool(keys & {"title", "name", "article_title", "doc_title", "fulltitle", "full_title"})
    has_url = bool(keys & {"url", "wiki_url", "feishu_url", "doc_url", "document_url", "original_url", "source_url"})
    return has_title and has_url


def normalize_record(record: dict[str, Any]) -> dict[str, Any]:
    title = first_string(record, "title", "article_title", "name", "docTitle", "doc_title", "fullTitle", "full_title")
    full_title = first_string(record, "fullTitle", "full_title", "docTitle", "doc_title", "article_title", "title", "name") or title
    date = normalize_date(
        first_string(record, "date", "publish_date", "published_at", "created_at", "time", "datetime") or full_title
    )
    month = normalize_month(first_string(record, "month", "publish_month") or date)
    url = first_string(record, "wiki_url", "feishu_url", "url", "doc_url", "document_url", "source_url", "original_url")
    images = image_count(record)
    theme = first_string(record, "theme", "category", "topic") or infer_theme(f"{title} {full_title}")

    return {
        "title": clean_title(title),
        "fullTitle": normalize_title(full_title),
        "date": date,
        "month": month,
        "url": url,
        "images": images,
        "theme": theme,
    }


def first_string(record: dict[str, Any], *keys: str) -> str:
    lowered = {key.lower(): key for key in record}
    for key in keys:
        actual = lowered.get(key.lower())
        if actual is None:
            continue
        value = record.get(actual)
        if value is None:
            continue
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, (int, float)):
            return str(value)
    return ""


def clean_title(value: str) -> str:
    return re.sub(r"（20\d{2}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日）$", "", normalize_title(value)).strip()


def normalize_title(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def normalize_date(value: str) -> str:
    text = value or ""
    match = re.search(r"(20\d{2})\D{0,3}(\d{1,2})\D{0,3}(\d{1,2})", text)
    if not match:
        return text.strip()
    year, month, day = (int(part) for part in match.groups())
    return f"{year} 年 {month} 月 {day} 日"


def normalize_month(value: str) -> str:
    match = re.search(r"(20\d{2})\s*年\s*(\d{1,2})\s*月", value or "")
    if not match:
        match = re.search(r"(20\d{2})\D{0,3}(\d{1,2})", value or "")
    if not match:
        return ""
    year, month = (int(part) for part in match.groups()[:2])
    return f"{year} 年 {month} 月"


def date_key(value: str) -> int:
    match = re.search(r"(20\d{2})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日", value or "")
    if not match:
        return 0
    year, month, day = (int(part) for part in match.groups())
    return year * 10000 + month * 100 + day


def image_count(record: dict[str, Any]) -> int:
    for key in ("images", "images_inserted", "image_count", "imageCount", "picture_count", "pic_count"):
        if key not in record:
            continue
        value = record[key]
        if isinstance(value, list):
            return len(value)
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)
    return 0


def infer_theme(text: str) -> str:
    lowered = text.lower()
    for theme, needles in THEMES.items():
        if any(needle in lowered for needle in needles):
            return theme
    return "趋势观察"


if __name__ == "__main__":
    main()
