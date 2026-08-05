"""重新 AI 提炼人民日报文章"""
from __future__ import annotations

import sys
import time

from essay_lib import extract_material, load_env, load_public_data, log, save_public_data, upsert_material

sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def main() -> None:
    env = load_env()
    data = load_public_data()
    articles = [a for a in data["articles"] if a.get("source") == "rmrb_paper"]
    log(f"重新 AI 提炼人民日报 {len(articles)} 篇")
    for i, article in enumerate(articles, 1):
        log(f"[{i}/{len(articles)}] {article.get('title')}")
        material = extract_material(env, article)
        upsert_material(data, material)
        log(f"  论点: {material.get('core_thesis', '')[:60]}")
        time.sleep(1)
    save_public_data(data)
    log("完成")


if __name__ == "__main__":
    main()
