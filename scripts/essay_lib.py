"""申论积累：爬虫 / AI / 存储 公共库"""
from __future__ import annotations

import json
import os
import re
import time
import uuid
import urllib.error
import urllib.request
from datetime import date, datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
DATA_FILE = BASE / "data" / "essay_public.json"
ENV_FILE = BASE / ".env"

TOPIC_TAGS = [
    "高质量发展", "新质生产力", "乡村振兴", "基层治理", "民生保障",
    "科技创新", "绿色发展", "文化自信", "大湾区建设", "青年担当",
    "营商环境", "数字经济", "共同富裕", "国家安全", "法治建设",
]

SOURCE_LABEL = {"rmrb": "人民锐评", "nfdb": "学习时评"}
USER_AGENT = "Mozilla/5.0 (compatible; EssayPlanner/1.0; +personal-study)"


def load_env() -> dict:
    env = dict(os.environ)
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            env.setdefault(key.strip(), val.strip())
    return env


def log(msg: str) -> None:
    print(f"[essay] {msg}")


def fetch_html(url: str, encoding: str | None = None) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    raw = urllib.request.urlopen(req, timeout=20).read()
    candidates = [encoding] if encoding else []
    candidates += ["utf-8", "gbk", "gb2312"]
    for enc in candidates:
        if not enc:
            continue
        try:
            return raw.decode(enc)
        except Exception:
            pass
    return raw.decode("utf-8", errors="replace")


def clean_text(html: str) -> str:
    text = re.sub(r"<script[\s\S]*?</script>", "", html, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", "", text, flags=re.I)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"</p>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def trim_footer(text: str) -> str:
    for marker in ("人民日报社概况", "人民网版权", "Copyright", "互联网新闻信息服务许可证"):
        idx = text.find(marker)
        if idx > 80:
            text = text[:idx]
    return text.strip()


def extract_article_content(html: str, source: str) -> str:
    patterns = []
    if source == "nfdb":
        patterns = [
            r'class="article-content"[^>]*>([\s\S]*?)</div>',
            r'class="content"[^>]*>([\s\S]*?)</div>',
        ]
    else:
        patterns = [
            r'id="p_content"[^>]*>([\s\S]*?)</div>',
            r'class="rm_txt_con"[^>]*>([\s\S]*?)</div>',
            r'class="box_con"[^>]*>([\s\S]*?)</div>',
        ]
    for pat in patterns:
        m = re.search(pat, html, flags=re.I)
        if m:
            text = clean_text(m.group(1))
            if len(text) >= 120:
                return text
    paras = re.findall(r"<p[^>]*>([\s\S]*?)</p>", html, flags=re.I)
    chunks = [clean_text(p) for p in paras if len(clean_text(p)) >= 20]
    return trim_footer("\n".join(chunks))


def parse_date(text: str) -> str | None:
    m = re.search(r"(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})", text)
    if not m:
        return None
    y, mo, d = m.groups()
    return f"{y}-{int(mo):02d}-{int(d):02d}"


def crawl_southcn(max_pages: int = 2) -> list[dict]:
    items = []
    seen = set()
    for page in range(1, max_pages + 1):
        url = f"https://news.southcn.com/node_85bedd3e4b?cms_node_post_list_page={page}"
        html = fetch_html(url)
        for m in re.finditer(
            r'href="(https://news\.southcn\.com/node_[^"]+\.shtml)"',
            html,
        ):
            link = m.group(1)
            if link in seen:
                continue
            seen.add(link)
            title_m = re.search(
                rf'href="{re.escape(link)}"[^>]*>\s*<h3[^>]*>([^<]+)</h3>',
                html,
            )
            title = title_m.group(1).strip() if title_m else ""
            date_m = re.search(
                rf'href="{re.escape(link)}"[\s\S]{{0,400}}?(\d{{4}}-\d{{2}}-\d{{2}})',
                html,
            )
            items.append({
                "source": "nfdb",
                "title": title,
                "url": link,
                "publish_date": date_m.group(1) if date_m else None,
            })
        time.sleep(1.5)
    return items


def crawl_people(max_pages: int = 2) -> list[dict]:
    items = []
    seen = set()
    for page in range(1, max_pages + 1):
        suffix = "" if page == 1 else str(page)
        url = f"http://opinion.people.com.cn/GB/436867/index{suffix}.html"
        html = fetch_html(url, "gbk")
        for m in re.finditer(
            r'href="(http://opinion\.people\.com\.cn/n1/\d{4}/\d{4}/[^"]+\.html)"',
            html,
        ):
            link = m.group(1)
            if link in seen:
                continue
            seen.add(link)
            title_m = re.search(
                rf'<a[^>]+href="{re.escape(link)}"[^>]*>([^<]+)</a>',
                html,
            )
            title = clean_text(title_m.group(1)) if title_m else ""
            if not title or not title.startswith("人民锐评"):
                continue
            date_m = re.search(r"/n1/(\d{4})/(\d{4})/", link)
            pub = None
            if date_m:
                y, md = date_m.group(1), date_m.group(2)
                pub = f"{y}-{md[:2]}-{md[2:]}"
            items.append({
                "source": "rmrb",
                "title": title,
                "url": link,
                "publish_date": pub,
            })
        time.sleep(1.5)
    return items


def fetch_article_body(item: dict) -> dict:
    enc = "gbk" if item["source"] == "rmrb" else "utf-8"
    html = fetch_html(item["url"], enc)
    title_m = re.search(r"<title>([^<]+)</title>", html, flags=re.I)
    title = item.get("title") or ""
    if title_m:
        raw_title = clean_text(title_m.group(1))
        title = raw_title.split("_")[0].split("--")[0].strip() or title
    content = extract_article_content(html, item["source"])
    pub = item.get("publish_date") or parse_date(html[:2000])
    return {
        **item,
        "title": title,
        "publish_date": pub,
        "raw_content": content,
        "crawled_at": datetime.utcnow().isoformat() + "Z",
    }


def load_public_data() -> dict:
    if DATA_FILE.exists():
        try:
            return json.loads(DATA_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {
        "updated_at": None,
        "articles": [],
        "materials": [],
        "daily_pick": None,
    }


def save_public_data(data: dict) -> None:
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    data["updated_at"] = datetime.utcnow().isoformat() + "Z"
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    log(f"已写入 {DATA_FILE}")


def find_article(data: dict, url: str) -> dict | None:
    return next((a for a in data["articles"] if a["url"] == url), None)


def upsert_article(data: dict, article: dict) -> dict:
    existing = find_article(data, article["url"])
    if existing:
        existing.update(article)
        return existing
    article = {"id": str(uuid.uuid4()), **article}
    data["articles"].append(article)
    return article


def find_material_by_article(data: dict, article_id: str) -> dict | None:
    return next((m for m in data["materials"] if m["article_id"] == article_id), None)


def upsert_material(data: dict, material: dict) -> dict:
    existing = next((m for m in data["materials"] if m["article_id"] == material["article_id"]), None)
    if existing:
        existing.update(material)
        return existing
    material = {"id": str(uuid.uuid4()), "created_at": datetime.utcnow().isoformat() + "Z", **material}
    data["materials"].append(material)
    return material


def call_ai(env: dict, prompt: str, retries: int = 2) -> str:
    payload = {
        "model": env.get("AI_MODEL", "minimax"),
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
        "top_p": 1.0,
        "stream": False,
        "max_tokens": int(env.get("AI_MAX_TOKENS", "2500")),
    }
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(
                env["AI_API_URL"],
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {env['AI_API_KEY']}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=25) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            return body["choices"][0]["message"]["content"]
        except Exception as err:
            last_err = err
            log(f"AI 请求失败 ({attempt}/{retries}): {err}")
            time.sleep(3 * attempt)
    raise last_err


def build_extract_prompt(article: dict) -> str:
    content = trim_footer(article.get("raw_content", ""))[:3500]
    source_label = SOURCE_LABEL.get(article["source"], article["source"])
    tags = "、".join(TOPIC_TAGS)
    return f"""你是申论备考助手。请从以下官媒评论文章中提炼申论素材，输出严格 JSON（不要 markdown 代码块）。

字段说明：
- topic_tags: 从词表中选 1-3 个
- core_thesis: 核心论点，不超过 40 字
- golden_sentences: 数组，每项 {{\"text\":\"金句\",\"usage\":\"开头|过渡|结尾\"}}
- evidence_cases: 数组，每项 {{\"fact\":\"论据\",\"source_hint\":\"出处提示\"}}
- policy_suggestions: 字符串数组，3-5 条对策，格式「动词+对象+目标」
- applicable_types: 从「大作文」「策论文」「综合分析」中选 1-2 个
- ai_summary: 100 字以内速读摘要

主题词表：{tags}

文章标题：{article.get('title', '')}
文章来源：{source_label}
正文：
{content}
"""


def parse_ai_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def fallback_extract(article: dict) -> dict:
    content = trim_footer(article.get("raw_content", ""))
    paras = [p.strip() for p in re.split(r"[\n。！]", content) if len(p.strip()) >= 18]
    title = article.get("title", "")
    thesis = title.split("：", 1)[-1][:40] if "：" in title else (paras[0][:40] if paras else title[:40])

    golden = []
    for p in paras:
        if len(golden) >= 2:
            break
        if "、" in p and len(p) <= 80:
            golden.append({"text": p, "usage": "过渡"})
        elif "既要" in p or "只有" in p or "才能" in p:
            golden.append({"text": p[:80], "usage": "结尾"})

    policies = []
    for p in paras:
        if len(policies) >= 4:
            break
        if p.startswith(("要", "应", "坚持", "强化", "聚焦", "推动", "深入实施")):
            policies.append(p[:60])

    tags = []
    keyword_map = {
        "高质量发展": ["高质量发展", "现代化"],
        "基层治理": ["基层", "治理", "监管"],
        "民生保障": ["民生", "人民", "群众", "安全"],
        "绿色发展": ["生态", "绿色", "环保", "治沙"],
        "文化自信": ["文化", "文明"],
        "大湾区建设": ["粤港澳", "大湾区", "广东"],
        "科技创新": ["科技", "创新", "数字"],
        "青年担当": ["青年", "青春"],
    }
    blob = f"{title} {content[:800]}"
    for tag, keys in keyword_map.items():
        if any(k in blob for k in keys):
            tags.append(tag)
    if not tags:
        tags = ["高质量发展"]

    return {
        "article_id": article["id"],
        "topic_tags": tags[:3],
        "core_thesis": thesis,
        "golden_sentences": golden or [{"text": paras[0][:60], "usage": "开头"}] if paras else [],
        "evidence_cases": [{"fact": paras[1][:80], "source_hint": SOURCE_LABEL.get(article["source"], "")}] if len(paras) > 1 else [],
        "policy_suggestions": policies or [paras[-1][:60]] if paras else [],
        "applicable_types": ["大作文", "策论文"],
        "ai_summary": content[:100],
    }


def extract_material(env: dict, article: dict) -> dict:
    try:
        raw = call_ai(env, build_extract_prompt(article))
        parsed = parse_ai_json(raw)
        return {
            "article_id": article["id"],
            "topic_tags": parsed.get("topic_tags", [])[:3],
            "core_thesis": str(parsed.get("core_thesis", ""))[:120],
            "golden_sentences": parsed.get("golden_sentences", [])[:3],
            "evidence_cases": parsed.get("evidence_cases", [])[:2],
            "policy_suggestions": parsed.get("policy_suggestions", [])[:5],
            "applicable_types": parsed.get("applicable_types", [])[:2],
            "ai_summary": str(parsed.get("ai_summary", ""))[:200],
        }
    except Exception as err:
        log(f"AI 不可用，使用规则兜底: {err}")
        return fallback_extract(article)


def pick_daily_material(data: dict, pick_day: str | None = None) -> dict | None:
    pick_day = pick_day or date.today().isoformat()
    materials = data.get("materials", [])
    if not materials:
        return None

    articles_by_id = {a["id"]: a for a in data.get("articles", [])}

    def score(material: dict) -> tuple:
        article = articles_by_id.get(material["article_id"], {})
        pub = article.get("publish_date") or ""
        recency = 0
        if pub == pick_day:
            recency = 100
        elif pub:
            try:
                delta = (date.fromisoformat(pick_day) - date.fromisoformat(pub)).days
                recency = max(0, 30 - delta)
            except Exception:
                recency = 0
        source_bonus = 5 if article.get("source") == "nfdb" else 0
        return (recency + source_bonus, pub)

    ranked = sorted(materials, key=score, reverse=True)
    material = ranked[0]
    article = articles_by_id.get(material["article_id"])
    return {
        "pick_date": pick_day,
        "material_id": material["id"],
        "source_label": SOURCE_LABEL.get(article.get("source", ""), ""),
        "material": material,
        "article": article,
    }


def supabase_request(env: dict, method: str, table: str, payload=None, params: str = "") -> list | dict | None:
    key = env.get("SUPABASE_SERVICE_KEY", "").strip()
    url = env.get("SUPABASE_URL", "").strip()
    if not key or not url:
        return None
    endpoint = f"{url.rstrip('/')}/rest/v1/{table}{params}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    data = None
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(endpoint, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")
        log(f"Supabase {method} {table} 失败: {err.code} {detail[:200]}")
        return None
