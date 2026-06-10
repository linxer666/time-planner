"""申论积累一键流水线：爬取 → AI 提炼 → 每日推荐 → 导出 JSON"""
from __future__ import annotations

import sys
import time

from essay_lib import (
    crawl_people,
    crawl_southcn,
    extract_material,
    fallback_extract,
    fetch_article_body,
    load_env,
    load_public_data,
    log,
    pick_daily_materials,
    save_public_data,
    upsert_article,
    upsert_material,
)

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def crawl_new_articles(data: dict, limit_per_source: int = 3) -> int:
    candidates = crawl_southcn(2) + crawl_people(2)
    added = 0
    per_source = {"rmrb": 0, "nfdb": 0}
    for item in candidates:
        src = item["source"]
        if per_source[src] >= limit_per_source:
            continue
        if any(a["url"] == item["url"] for a in data["articles"]):
            continue
        log(f"抓取正文: {item.get('title') or item['url']}")
        try:
            article = fetch_article_body(item)
        except Exception as err:
            log(f"跳过 {item['url']}: {err}")
            continue
        if len(article.get("raw_content", "")) < 120:
            log(f"正文过短，跳过: {article.get('title')}")
            continue
        upsert_article(data, article)
        per_source[src] += 1
        added += 1
        time.sleep(2)
    return added


def extract_pending(
    data: dict,
    env: dict,
    limit: int = 2,
    fallback_only: bool = False,
    balanced: bool = False,
) -> int:
    pending = []
    for article in data["articles"]:
        if next((m for m in data["materials"] if m["article_id"] == article["id"]), None):
            continue
        if len(article.get("raw_content", "")) < 120:
            continue
        pending.append(article)
    pending.sort(key=lambda a: a.get("publish_date") or "", reverse=True)

    per_source = {"rmrb": 0, "nfdb": 0}
    max_per_source = 1 if balanced and limit >= 2 else limit
    done = 0
    rounds = 0
    while done < limit and pending and rounds < limit * 3:
        rounds += 1
        progressed = False
        for article in list(pending):
            if done >= limit:
                break
            src = article["source"]
            if balanced and per_source[src] >= max_per_source:
                continue
            log(f"提炼: {article.get('title')}")
            material = fallback_extract(article) if fallback_only else extract_material(env, article)
            upsert_material(data, material)
            per_source[src] += 1
            done += 1
            progressed = True
            pending.remove(article)
            time.sleep(0.5)
        if balanced and not progressed:
            max_per_source += 1
        elif not progressed:
            break
    return done


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--extract-only", action="store_true", help="仅对已有文章做提炼")
    parser.add_argument("--daily", action="store_true", help="每日模式：每源抓1篇、各源提炼1篇、更新今日推荐")
    parser.add_argument("--limit", type=int, default=None, help="本次最多提炼篇数")
    parser.add_argument("--crawl-limit", type=int, default=None, help="每个来源最多抓取篇数")
    parser.add_argument("--fallback-only", action="store_true", help="跳过 AI，仅用规则兜底")
    args = parser.parse_args()

    extract_limit = args.limit if args.limit is not None else (2 if args.daily else 2)
    crawl_limit = args.crawl_limit if args.crawl_limit is not None else (1 if args.daily else 3)
    balanced = args.daily

    env = load_env()
    data = load_public_data()

    if not args.extract_only:
        crawled = crawl_new_articles(data, limit_per_source=crawl_limit)
        log(f"新增文章 {crawled} 篇")
    else:
        log("跳过爬取，仅提炼已有文章")

    extracted = extract_pending(
        data,
        env,
        limit=extract_limit,
        fallback_only=args.fallback_only,
        balanced=balanced,
    )
    log(f"提炼完成 {extracted} 篇")

    daily_picks = pick_daily_materials(data)
    data["daily_picks"] = daily_picks
    data.pop("daily_pick", None)
    if daily_picks:
        for pick in daily_picks:
            log(f"今日推荐 [{pick.get('source_label')}]: {pick['article'].get('title')}")
    else:
        log("暂无可用素材，请先爬取并提炼")

    save_public_data(data)
    log("完成")


if __name__ == "__main__":
    main()
