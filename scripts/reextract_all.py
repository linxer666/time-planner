"""清空已有素材，用 AI 重新提炼全部文章（本地预览用）"""
from __future__ import annotations

import sys

from essay_lib import (
    extract_material,
    load_env,
    load_public_data,
    log,
    pick_daily_materials,
    save_public_data,
    upsert_material,
)

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def main() -> None:
    env = load_env()
    data = load_public_data()
    articles = [a for a in data["articles"] if len(a.get("raw_content", "")) >= 120]
    log(f"清空旧素材，准备重新提炼 {len(articles)} 篇")
    data["materials"] = []

    for i, article in enumerate(articles, 1):
        log(f"[{i}/{len(articles)}] 提炼: {article.get('title')}")
        material = extract_material(env, article)
        upsert_material(data, material)
        log(f"  论点: {material.get('core_thesis', '')[:50]}")

    daily_picks = pick_daily_materials(data)
    data["daily_picks"] = daily_picks
    data.pop("daily_pick", None)
    for pick in daily_picks:
        log(f"今日推荐 [{pick.get('source_label')}]: {pick['article'].get('title')}")
    save_public_data(data)
    log("全部完成")


if __name__ == "__main__":
    main()
