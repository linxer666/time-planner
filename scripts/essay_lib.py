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
        "daily_picks": [],
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
        "max_tokens": int(env.get("AI_MAX_TOKENS", "8000")),
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
            with urllib.request.urlopen(req, timeout=90) as resp:
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
    return f"""你是专业公考申论素材提炼助手，精通国考、省考申论阅卷评分标准，擅长拆解人民日报、南方日报、学习时评、人民锐评等官方权威评论文章，精准提取适配申论答题、大作文写作的标准化高分素材，同步梳理文中提及的国家/地方相关政策，并详细拆解文章整体架构、段落逻辑与行文结构，严格按照指定JSON格式输出，**仅输出纯净JSON对象，无任何多余文字、注释、符号、代码块，首字符必须是{{**。

## 固定主题词表（topic_tags仅限从中选取1-3个最贴合核心主旨的关键词，优先首选核心主题，不堆砌、不跑偏）
{tags}

## 输入内容
文章标题：{article.get('title', '')}
文章来源：{source_label}
文章正文：{content}

## 强制提取规则（严格执行，决定素材质量）
1. topic_tags: 从固定主题词表中选1-3个
2. core_thesis: 提炼全文**唯一总论点**，高度凝练、站位拔高、贴合政策，字数≤40字，紧扣文章核心立意，适配申论一类文立意标准
3. article_structure: 对象，详细分析全文行文框架，键名固定为 overview（整体框架概述）、opening（开篇功能）、body（主体层次与论证安排）、closing（结尾功能与升华方式）
4. argument_points: 数组，2-3个**并列/递进/因果**逻辑的标准申论分论点，每项 {{\"point\":\"分论点\",\"logic\":\"因果|递进|并列\",\"method\":\"该分论点在文中的论证方式\"}}，逻辑清晰、句式工整、可直接套用
5. golden_sentences: 数组，3-5句**适配考场写作**的高分金句，每项 {{\"text\":\"金句\",\"usage\":\"开头|过渡|结尾\"}}，拒绝普通大白话，语句权威凝练、对仗工整
6. evidence_cases: 数组，每项 {{\"fact\":\"具体事实/数据/案例\",\"source_hint\":\"出处提示\"}}，内容详实不空洞，可直接用作论据
7. related_policies: 数组，每项 {{\"name\":\"政策/规划/法规名称\",\"content\":\"核心内容\",\"direction\":\"实施方向\"}}；无则返回空数组
8. policy_suggestions: 字符串数组，3-5条**申论标准化对策**，统一采用「动词+治理/发展对象+落地目标」句式，务实精准可落地
9. applicable_types: 从【大作文、策论文、综合分析】中选1-2个
10. ai_summary: 100字以内精简速读摘要，概括背景、核心观点、核心举措、关键政策，要点全覆盖
11. paragraph_logic: 字符串，分析主体段落内部逻辑，说明如何运用案例、政策、道理论证，以及衔接过渡手法
12. 整体要求：所有素材贴合申论考场使用，杜绝口语化、碎片化；结构分析通俗易懂，适配写作模仿学习

## JSON输出字段（严格按此键名）
topic_tags, core_thesis, article_structure, argument_points, golden_sentences, evidence_cases, related_policies, policy_suggestions, applicable_types, ai_summary, paragraph_logic
"""


def parse_ai_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # minimax 等模型可能在 JSON 前输出思考过程
    if "</think>" in text:
        text = text.split("</think>", 1)[-1].strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
    # 从已知字段名定位 JSON 起点，避免思考过程中的花括号干扰
    for marker in ('{"topic_tags"', "{\n  \"topic_tags\"", "{\r\n  \"topic_tags\""):
        idx = text.rfind(marker)
        if idx >= 0:
            try:
                return json.loads(text[idx:])
            except json.JSONDecodeError:
                pass
    # 括号配对：从每个 { 起尝试解析
    for idx in reversed([m.start() for m in re.finditer(r"\{", text)]):
        try:
            return json.loads(text[idx:])
        except json.JSONDecodeError:
            continue
    raise json.JSONDecodeError("未找到有效 JSON", text, 0)


def fallback_extract(article: dict) -> dict:
    content = trim_footer(article.get("raw_content", ""))
    paras = [p.strip() for p in re.split(r"[\n。！]", content) if len(p.strip()) >= 18]
    title = article.get("title", "")
    thesis = title.split("：", 1)[-1][:40] if "：" in title else (paras[0][:40] if paras else title[:40])

    golden = []
    for p in paras:
        if len(golden) >= 3:
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

    arg_points = []
    for p in paras[1:4]:
        if p.startswith(("要", "应", "坚持", "推动", "聚焦")):
            arg_points.append({"point": p[:50], "logic": "递进", "method": "政策引领+举措论证"})
    if not arg_points and len(paras) > 1:
        arg_points.append({"point": paras[1][:50], "logic": "因果", "method": "道理+事实支撑"})

    related = []
    for p in paras:
        if len(related) >= 3:
            break
        if re.search(r"(规划|条例|法|方案|行动|部署|意见|纲要)", p):
            related.append({"name": p[:30], "content": p[:60], "direction": "见原文"})

    return {
        "article_id": article["id"],
        "topic_tags": tags[:3],
        "core_thesis": thesis,
        "article_structure": {
            "overview": "开篇点题—主体分层论证—结尾升华号召",
            "opening": paras[0][:80] if paras else "",
            "body": "；".join(p[:40] for p in paras[1:3]) if len(paras) > 1 else "",
            "closing": paras[-1][:80] if paras else "",
        },
        "argument_points": arg_points[:3],
        "golden_sentences": golden or [{"text": paras[0][:60], "usage": "开头"}] if paras else [],
        "evidence_cases": [{"fact": paras[1][:80], "source_hint": SOURCE_LABEL.get(article["source"], "")}] if len(paras) > 1 else [],
        "related_policies": related,
        "policy_suggestions": policies or [paras[-1][:60]] if paras else [],
        "applicable_types": ["大作文", "策论文"],
        "ai_summary": content[:100],
        "paragraph_logic": paras[1][:120] if len(paras) > 1 else "",
    }


def extract_material(env: dict, article: dict) -> dict:
    last_err = None
    for attempt in range(1, 4):
        try:
            raw = call_ai(env, build_extract_prompt(article), retries=1)
            parsed = parse_ai_json(raw)
            related = parsed.get("related_policies", [])[:5]
            if related and isinstance(related[0], str):
                related = [{"name": item[:40], "content": item, "direction": ""} for item in related]
            structure = parsed.get("article_structure", {})
            if isinstance(structure, str):
                structure = {"overview": structure[:300], "opening": "", "body": "", "closing": ""}
            elif not isinstance(structure, dict):
                structure = {}
            return {
                "article_id": article["id"],
                "topic_tags": parsed.get("topic_tags", [])[:3],
                "core_thesis": str(parsed.get("core_thesis", ""))[:120],
                "article_structure": {
                    "overview": str(structure.get("overview", ""))[:300],
                    "opening": str(structure.get("opening", ""))[:200],
                    "body": str(structure.get("body", ""))[:400],
                    "closing": str(structure.get("closing", ""))[:200],
                },
                "argument_points": parsed.get("argument_points", [])[:3],
                "golden_sentences": parsed.get("golden_sentences", [])[:5],
                "evidence_cases": parsed.get("evidence_cases", [])[:4],
                "related_policies": related,
                "policy_suggestions": parsed.get("policy_suggestions", [])[:5],
                "applicable_types": parsed.get("applicable_types", [])[:2],
                "ai_summary": str(parsed.get("ai_summary", ""))[:200],
                "paragraph_logic": str(parsed.get("paragraph_logic", ""))[:500],
            }
        except Exception as err:
            last_err = err
            log(f"AI 提炼失败 ({attempt}/3): {err}")
            time.sleep(2 * attempt)
    log(f"AI 不可用，使用规则兜底: {last_err}")
    return fallback_extract(article)


def _material_recency_score(material: dict, articles_by_id: dict, pick_day: str) -> tuple:
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
    return (recency, pub)


def _build_daily_pick(material: dict, article: dict, pick_day: str) -> dict:
    return {
        "pick_date": pick_day,
        "material_id": material["id"],
        "source": article.get("source", ""),
        "source_label": SOURCE_LABEL.get(article.get("source", ""), ""),
        "material": material,
        "article": article,
    }


def pick_daily_materials(data: dict, pick_day: str | None = None) -> list[dict]:
    """每日推荐两篇：学习时评（南方）+ 人民锐评各一篇。"""
    pick_day = pick_day or date.today().isoformat()
    materials = data.get("materials", [])
    if not materials:
        return []

    articles_by_id = {a["id"]: a for a in data.get("articles", [])}
    picks = []
    for source in ("nfdb", "rmrb"):
        pool = [
            m for m in materials
            if articles_by_id.get(m["article_id"], {}).get("source") == source
        ]
        if not pool:
            continue
        material = max(pool, key=lambda m: _material_recency_score(m, articles_by_id, pick_day))
        article = articles_by_id.get(material["article_id"])
        if article:
            picks.append(_build_daily_pick(material, article, pick_day))
    return picks


def pick_daily_material(data: dict, pick_day: str | None = None) -> dict | None:
    picks = pick_daily_materials(data, pick_day)
    return picks[0] if picks else None


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
