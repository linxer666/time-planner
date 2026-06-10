(function () {
  const SOURCE_LABEL = { rmrb: "人民锐评", nfdb: "学习时评" };
  const USAGE_LABEL = { "开头": "开头", "过渡": "过渡", "结尾": "结尾" };
  let cache = null;
  let cacheAt = 0;
  let dailyIndex = 0;
  const CACHE_MS = 5 * 60 * 1000;

  function $(sel) { return document.querySelector(sel); }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function appBase() {
    const essayScript = document.querySelector('script[src*="essay.js"]');
    if (essayScript?.src) {
      return essayScript.src.replace(/modules\/essay\.js.*$/, "");
    }
    const path = window.location.pathname;
    if (path.endsWith(".html")) return path.slice(0, path.lastIndexOf("/") + 1);
    return path.endsWith("/") ? path : `${path}/`;
  }

  function dataUrl(file) {
    return `${appBase()}${file}`;
  }

  async function loadEssayData(force) {
    if (!force && cache && Date.now() - cacheAt < CACHE_MS) return cache;
    const url = `${dataUrl("data/essay_public.json")}?v=${Date.now()}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cache = await res.json();
      cacheAt = Date.now();
      cache._loadError = null;
      return cache;
    } catch (err) {
      console.warn("申论数据加载失败:", url, err);
      cache = { articles: [], materials: [], daily_picks: [], _loadError: String(err.message || err) };
      cacheAt = Date.now();
      return cache;
    }
  }

  function getDailyPicks(data) {
    if (data.daily_picks?.length) return data.daily_picks;
    if (data.daily_pick?.material) return [data.daily_pick];
    return [];
  }

  function getUserAction(store, materialId) {
    return store.list("essay_user_actions").find((a) => a.material_id === materialId) || null;
  }

  function renderTags(tags) {
    if (!tags?.length) return "";
    return tags.map((t) => `<span class="essay-tag">${escapeHtml(t)}</span>`).join("");
  }

  function renderGoldenSentences(sentences, limit = 3) {
    if (!sentences?.length) return `<p class="muted small-hint">暂无金句</p>`;
    return sentences.slice(0, limit).map((s) => {
      const usage = USAGE_LABEL[s.usage] || s.usage || "通用";
      return `<div class="essay-quote">
        <p>「${escapeHtml(s.text || "")}」</p>
        <small>适合：${escapeHtml(usage)}</small>
      </div>`;
    }).join("");
  }

  function renderArgumentPoints(points) {
    if (!points?.length) return `<p class="muted small-hint">暂无分论点</p>`;
    return `<ul class="essay-arg-list">${points.map((p) =>
      `<li>
        <strong>${escapeHtml(p.point || "")}</strong>
        ${p.logic ? `<small>（${escapeHtml(p.logic)}）</small>` : ""}
        ${p.method ? `<p class="essay-arg-method">${escapeHtml(p.method)}</p>` : ""}
      </li>`
    ).join("")}</ul>`;
  }

  function renderArticleStructure(structure) {
    if (!structure) return `<p class="muted small-hint">暂无结构分析</p>`;
    if (typeof structure === "string") {
      return `<p class="essay-structure-text">${escapeHtml(structure)}</p>`;
    }
    const rows = [
      ["整体框架", structure.overview],
      ["开篇", structure.opening],
      ["主体", structure.body],
      ["结尾", structure.closing]
    ].filter(([, val]) => val);
    if (!rows.length) return `<p class="muted small-hint">暂无结构分析</p>`;
    return `<div class="essay-structure-grid">${rows.map(([label, val]) =>
      `<div class="essay-structure-item"><strong>${escapeHtml(label)}</strong><p>${escapeHtml(val)}</p></div>`
    ).join("")}</div>`;
  }

  function renderPolicyList(items) {
    if (!items?.length) return "<li class=\"muted\">暂无对策</li>";
    return items.slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  }

  function renderEvidenceList(items) {
    if (!items?.length) return "<li class=\"muted\">暂无论据</li>";
    return items.slice(0, 4).map((item) =>
      `<li>${escapeHtml(item.fact || "")}${item.source_hint ? `<small>（${escapeHtml(item.source_hint)}）</small>` : ""}</li>`
    ).join("");
  }

  function renderRelatedPolicies(items) {
    if (!items?.length) return `<p class="muted small-hint">暂无相关政策</p>`;
    return `<ul class="essay-policy-list">${items.slice(0, 5).map((item) => {
      if (typeof item === "string") return `<li>${escapeHtml(item)}</li>`;
      const name = item.name ? `<strong>${escapeHtml(item.name)}</strong>：` : "";
      const body = [item.content, item.direction].filter(Boolean).join("；");
      return `<li>${name}${escapeHtml(body)}</li>`;
    }).join("")}</ul>`;
  }

  function renderArticleBreakdown(material, article, options = {}) {
    const { compact = false, showSummary = true } = options;
    const types = (material.applicable_types || []).map((t) => `<span class="essay-tag">${escapeHtml(t)}</span>`).join("");
    const summary = showSummary && material.ai_summary
      ? `<p class="essay-summary">${escapeHtml(material.ai_summary)}</p>`
      : "";

    return `
      <p class="essay-thesis"><strong>核心论点：</strong>${escapeHtml(material.core_thesis || material.ai_summary || "")}</p>
      <div class="essay-tags">${renderTags(material.topic_tags)}${types}</div>
      ${summary}
      <div class="essay-detail-grid${compact ? " compact" : ""}">
        <div class="essay-detail-block full-width">
          <h4>行文结构</h4>
          ${renderArticleStructure(material.article_structure)}
        </div>
        <div class="essay-detail-block full-width">
          <h4>段落逻辑</h4>
          <p class="essay-structure-text">${material.paragraph_logic ? escapeHtml(material.paragraph_logic) : '<span class="muted">暂无分析</span>'}</p>
        </div>
        <div class="essay-detail-block">
          <h4>论证结构</h4>
          ${renderArgumentPoints(material.argument_points)}
        </div>
        <div class="essay-detail-block">
          <h4>金句积累</h4>
          ${renderGoldenSentences(material.golden_sentences, compact ? 3 : 5)}
        </div>
        <div class="essay-detail-block">
          <h4>论据案例</h4>
          <ul>${renderEvidenceList(material.evidence_cases)}</ul>
        </div>
        <div class="essay-detail-block">
          <h4>相关政策</h4>
          ${renderRelatedPolicies(material.related_policies)}
        </div>
        <div class="essay-detail-block full-width">
          <h4>对策框架</h4>
          <ul>${renderPolicyList(material.policy_suggestions)}</ul>
        </div>
      </div>`;
  }

  function renderDailyNav(picks, index) {
    if (picks.length <= 1) return "";
    const tabs = picks.map((pick, i) => {
      const label = pick.source_label || SOURCE_LABEL[pick.source] || `推荐 ${i + 1}`;
      return `<button type="button" class="essay-daily-tab${i === index ? " active" : ""}" data-daily-tab="${i}">${escapeHtml(label)}</button>`;
    }).join("");

    return `
      <div class="essay-daily-nav">
        <button type="button" class="essay-nav-btn" data-daily-prev aria-label="上一篇">‹</button>
        <div class="essay-daily-tabs">${tabs}</div>
        <span class="essay-daily-counter">${index + 1} / ${picks.length}</span>
        <button type="button" class="essay-nav-btn" data-daily-next aria-label="下一篇">›</button>
      </div>`;
  }

  function bindDailyNav(card, store, data, picks) {
    const go = (nextIndex) => {
      dailyIndex = (nextIndex + picks.length) % picks.length;
      renderDailyCard(store, data);
    };
    card.querySelector("[data-daily-prev]")?.addEventListener("click", () => go(dailyIndex - 1));
    card.querySelector("[data-daily-next]")?.addEventListener("click", () => go(dailyIndex + 1));
    card.querySelectorAll("[data-daily-tab]").forEach((btn) => {
      btn.addEventListener("click", () => go(Number(btn.dataset.dailyTab)));
    });
  }

  function renderDailyCard(store, data) {
    const card = $("#essayDailyCard");
    if (!card) return;

    const picks = getDailyPicks(data);
    if (!picks.length) {
      const errHint = data._loadError
        ? `<p class="muted small-hint">数据文件加载失败（${escapeHtml(data._loadError)}），请确认已部署 <code>data/essay_public.json</code>。</p>`
        : "";
      card.innerHTML = `
        <div class="section-head compact">
          <div>
            <p class="eyebrow">人民锐评 · 学习时评</p>
            <h2>今日申论积累</h2>
          </div>
        </div>
        <p class="inline-empty">暂无素材。本地运行 <code>scripts/run_essay_pipeline.ps1</code> 生成后刷新。</p>
        ${errHint}`;
      return;
    }

    if (dailyIndex >= picks.length) dailyIndex = 0;
    const pick = picks[dailyIndex];
    const { material, article } = pick;
    const action = getUserAction(store, material.id);
    const starred = action?.starred;
    const read = !!action?.read_at;
    const source = pick.source_label || SOURCE_LABEL[article.source] || "官媒评论";

    card.innerHTML = `
      <div class="section-head compact">
        <div>
          <p class="eyebrow">每日推荐 · ${escapeHtml(pick.pick_date || today())}</p>
          <h2>今日申论积累</h2>
        </div>
        <div class="essay-daily-meta">
          <span class="badge ${read ? "done" : ""}">${escapeHtml(source)}</span>
          ${article.publish_date ? `<span class="badge">${escapeHtml(article.publish_date)}</span>` : ""}
        </div>
      </div>
      ${renderDailyNav(picks, dailyIndex)}
      <div class="essay-daily-body">
        <h3 class="essay-title">${escapeHtml(article.title || "无标题")}</h3>
        ${renderArticleBreakdown(material, article)}
      </div>
      <div class="essay-actions">
        <a class="ghost-btn sm-btn" href="${escapeHtml(article.url)}" target="_blank" rel="noopener">阅读原文</a>
        <button class="ghost-btn sm-btn" type="button" data-essay-star="${material.id}">${starred ? "已收藏" : "收藏"}</button>
        <button class="ghost-btn sm-btn" type="button" data-essay-read="${material.id}">${read ? "已读" : "标记已读"}</button>
        <button class="ghost-btn sm-btn" type="button" data-essay-copy="${material.id}">复制积累</button>
      </div>`;

    bindDailyNav(card, store, data, picks);
    card.querySelector("[data-essay-star]")?.addEventListener("click", async () => {
      await toggleStar(store, material.id);
      renderDailyCard(store, data);
      renderLibrary(store, data);
    });
    card.querySelector("[data-essay-read]")?.addEventListener("click", async () => {
      await markRead(store, material.id);
      renderDailyCard(store, data);
    });
    card.querySelector("[data-essay-copy]")?.addEventListener("click", () => {
      copyMaterial(material, article);
    });
  }

  function renderLibrary(store, data) {
    const list = $("#essayLibraryList");
    const empty = $("#essayLibraryEmpty");
    if (!list) return;

    const sourceFilter = $("#essaySourceFilter")?.value || "";
    const tagFilter = $("#essayTagFilter")?.value || "";
    const search = ($("#essaySearch")?.value || "").trim().toLowerCase();
    const dailyIds = new Set(getDailyPicks(data).map((p) => p.material_id));

    const articlesById = Object.fromEntries((data.articles || []).map((a) => [a.id, a]));
    let items = (data.materials || []).map((m) => ({ material: m, article: articlesById[m.article_id] })).filter((x) => x.article);

    if (sourceFilter) items = items.filter((x) => x.article.source === sourceFilter);
    if (tagFilter) items = items.filter((x) => (x.material.topic_tags || []).includes(tagFilter));
    if (search) {
      items = items.filter((x) => {
        const blob = [
          x.article.title,
          x.material.core_thesis,
          x.material.ai_summary,
          ...(x.material.golden_sentences || []).map((s) => s.text),
          ...(x.material.argument_points || []).map((p) => `${p.point} ${p.logic} ${p.method || ""}`),
          x.material.paragraph_logic,
          ...(x.material.article_structure
            ? (typeof x.material.article_structure === "string"
              ? [x.material.article_structure]
              : Object.values(x.material.article_structure))
            : []),
          ...(x.material.related_policies || []).map((p) =>
            typeof p === "string" ? p : `${p.name} ${p.content} ${p.direction}`
          ),
          ...(x.material.policy_suggestions || []),
          ...(x.material.topic_tags || [])
        ].join(" ").toLowerCase();
        return blob.includes(search);
      });
    }

    items.sort((a, b) => (b.article.publish_date || "").localeCompare(a.article.publish_date || ""));

    list.innerHTML = items.map(({ material, article }) => {
      const action = getUserAction(store, material.id);
      const isDaily = dailyIds.has(material.id);
      return `<article class="essay-library-item ${action?.starred ? "starred" : ""}" id="essay-item-${material.id}">
        <div class="essay-library-head">
          <div>
            <h3>${escapeHtml(article.title || "")}</h3>
            <small>${escapeHtml(SOURCE_LABEL[article.source] || "")} · ${escapeHtml(article.publish_date || "")}${isDaily ? " · 今日推荐" : ""}</small>
          </div>
          <button class="ghost-btn sm-btn" type="button" data-essay-star="${material.id}">${action?.starred ? "★" : "☆"}</button>
        </div>
        ${renderArticleBreakdown(material, article, { compact: true, showSummary: false })}
        <div class="essay-actions">
          <a class="ghost-btn sm-btn" href="${escapeHtml(article.url)}" target="_blank" rel="noopener">原文</a>
          <button class="ghost-btn sm-btn" type="button" data-essay-copy="${material.id}">复制积累</button>
        </div>
      </article>`;
    }).join("");

    empty?.classList.toggle("hidden", items.length > 0);

    list.querySelectorAll("[data-essay-star]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await toggleStar(store, btn.dataset.essayStar);
        renderLibrary(store, data);
        renderDailyCard(store, data);
      });
    });
    list.querySelectorAll("[data-essay-copy]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const material = (data.materials || []).find((m) => m.id === btn.dataset.essayCopy);
        const article = articlesById[material?.article_id];
        if (material) copyMaterial(material, article);
      });
    });
  }

  function fillTagFilter(data) {
    const select = $("#essayTagFilter");
    if (!select) return;
    const tags = new Set();
    (data.materials || []).forEach((m) => (m.topic_tags || []).forEach((t) => tags.add(t)));
    const current = select.value;
    select.innerHTML = `<option value="">全部主题</option>${[...tags].sort().map((t) =>
      `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`
    ).join("")}`;
    select.value = current;
  }

  async function toggleStar(store, materialId) {
    const existing = getUserAction(store, materialId);
    if (existing) {
      await store.update("essay_user_actions", existing.id, { starred: !existing.starred });
    } else {
      await store.add("essay_user_actions", { material_id: materialId, starred: true, read_at: null, note: "" });
    }
  }

  async function markRead(store, materialId) {
    const existing = getUserAction(store, materialId);
    const now = new Date().toISOString();
    if (existing) {
      await store.update("essay_user_actions", existing.id, { read_at: now });
    } else {
      await store.add("essay_user_actions", { material_id: materialId, starred: false, read_at: now, note: "" });
    }
  }

  function copyMaterial(material, article) {
    const lines = [];
    lines.push(article?.title || "");
    lines.push(`论点：${material.core_thesis || ""}`);
    const st = material.article_structure;
    if (st) {
      if (typeof st === "string") lines.push(`行文结构：${st}`);
      else {
        if (st.overview) lines.push(`整体框架：${st.overview}`);
        if (st.opening) lines.push(`开篇：${st.opening}`);
        if (st.body) lines.push(`主体：${st.body}`);
        if (st.closing) lines.push(`结尾：${st.closing}`);
      }
    }
    if (material.paragraph_logic) lines.push(`段落逻辑：${material.paragraph_logic}`);
    (material.argument_points || []).forEach((p) => {
      lines.push(`分论点：${p.point}${p.logic ? `（${p.logic}）` : ""}${p.method ? `｜${p.method}` : ""}`);
    });
    (material.golden_sentences || []).forEach((s) => lines.push(`「${s.text}」— 适合${s.usage || "通用"}`));
    (material.related_policies || []).forEach((p) => {
      if (typeof p === "string") lines.push(`政策：${p}`);
      else lines.push(`政策：${[p.name, p.content, p.direction].filter(Boolean).join("；")}`);
    });
    (material.policy_suggestions || []).forEach((p) => lines.push(`对策：${p}`));
    const text = lines.filter(Boolean).join("\n");
    navigator.clipboard?.writeText(text).then(() => {
      window.PlannerApp?.toast?.("积累内容已复制");
    }).catch(() => {
      window.prompt("复制以下内容：", text);
    });
  }

  async function renderAll(store, force) {
    const card = $("#essayDailyCard");
    if (card && !card.dataset.rendered) {
      card.innerHTML = `<p class="inline-empty">加载中…</p>`;
    }
    try {
      const data = await loadEssayData(force);
      renderDailyCard(store, data);
      fillTagFilter(data);
      renderLibrary(store, data);
      if (card) card.dataset.rendered = "1";
    } catch (err) {
      console.error("申论渲染失败", err);
      if (card) {
        card.innerHTML = `<p class="inline-empty">加载失败：${escapeHtml(err.message || "未知错误")}</p>`;
      }
    }
  }

  window.PlannerEssay = {
    init(store) {
      $("#essaySourceFilter")?.addEventListener("change", () => renderAll(store));
      $("#essayTagFilter")?.addEventListener("change", () => renderAll(store));
      $("#essaySearch")?.addEventListener("input", () => renderAll(store));
      $("#refreshEssayBtn")?.addEventListener("click", () => renderAll(store, true));
      store.onChange(() => renderAll(store));
      document.addEventListener("keydown", (e) => {
        const essayView = document.getElementById("essayView");
        if (!essayView?.classList.contains("active") || !cache) return;
        if (e.target.matches("input, textarea, select")) return;
        const picks = getDailyPicks(cache);
        if (picks.length <= 1) return;
        if (e.key === "ArrowRight") {
          dailyIndex = (dailyIndex + 1) % picks.length;
          renderDailyCard(store, cache);
        } else if (e.key === "ArrowLeft") {
          dailyIndex = (dailyIndex - 1 + picks.length) % picks.length;
          renderDailyCard(store, cache);
        }
      });
      renderAll(store);
    },
    renderAll
  };
})();
