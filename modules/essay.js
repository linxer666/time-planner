(function () {
  const SOURCE_LABEL = { rmrb: "人民锐评", nfdb: "学习时评" };
  const USAGE_LABEL = { "开头": "开头", "过渡": "过渡", "结尾": "结尾" };

  let cache = null;
  let cacheAt = 0;
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
      cache = { articles: [], materials: [], daily_pick: null, _loadError: String(err.message || err) };
      cacheAt = Date.now();
      return cache;
    }
  }

  function articleById(data, id) {
    return (data.articles || []).find((a) => a.id === id) || null;
  }

  function getUserAction(store, materialId) {
    return store.list("essay_user_actions").find((a) => a.material_id === materialId) || null;
  }

  function renderTags(tags) {
    if (!tags?.length) return "";
    return tags.map((t) => `<span class="essay-tag">${escapeHtml(t)}</span>`).join("");
  }

  function renderGoldenSentences(sentences, limit = 2) {
    if (!sentences?.length) return `<p class="muted small-hint">暂无金句</p>`;
    return sentences.slice(0, limit).map((s) => {
      const usage = USAGE_LABEL[s.usage] || s.usage || "通用";
      return `<div class="essay-quote">
        <p>「${escapeHtml(s.text || "")}」</p>
        <small>适合：${escapeHtml(usage)}</small>
      </div>`;
    }).join("");
  }

  function renderPolicyList(items) {
    if (!items?.length) return "<li class=\"muted\">暂无对策</li>";
    return items.slice(0, 5).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  }

  function renderEvidenceList(items) {
    if (!items?.length) return "<li class=\"muted\">暂无论据</li>";
    return items.slice(0, 3).map((item) =>
      `<li>${escapeHtml(item.fact || "")}${item.source_hint ? `<small>（${escapeHtml(item.source_hint)}）</small>` : ""}</li>`
    ).join("");
  }

  function renderDailyCard(store, data) {
    const card = $("#essayDailyCard");
    if (!card) return;

    const pick = data.daily_pick;
    if (!pick?.material || !pick?.article) {
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

    const { material, article } = pick;
    const action = getUserAction(store, material.id);
    const starred = action?.starred;
    const read = !!action?.read_at;
    const source = pick.source_label || SOURCE_LABEL[article.source] || "官媒评论";
    const types = (material.applicable_types || []).map((t) => `<span class="essay-tag">${escapeHtml(t)}</span>`).join("");

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
      <div class="essay-daily-body">
        <h3 class="essay-title">${escapeHtml(article.title || "无标题")}</h3>
        <p class="essay-thesis"><strong>核心论点：</strong>${escapeHtml(material.core_thesis || material.ai_summary || "")}</p>
        <div class="essay-tags">${renderTags(material.topic_tags)}${types}</div>
        ${material.ai_summary ? `<p class="essay-summary">${escapeHtml(material.ai_summary)}</p>` : ""}
        <div class="essay-detail-grid">
          <div class="essay-detail-block">
            <h4>金句积累</h4>
            ${renderGoldenSentences(material.golden_sentences, 3)}
          </div>
          <div class="essay-detail-block">
            <h4>论据案例</h4>
            <ul>${renderEvidenceList(material.evidence_cases)}</ul>
          </div>
          <div class="essay-detail-block full-width">
            <h4>对策框架</h4>
            <ul>${renderPolicyList(material.policy_suggestions)}</ul>
          </div>
        </div>
      </div>
      <div class="essay-actions">
        <a class="ghost-btn sm-btn" href="${escapeHtml(article.url)}" target="_blank" rel="noopener">阅读原文</a>
        <button class="ghost-btn sm-btn" type="button" data-essay-star="${material.id}">${starred ? "已收藏" : "收藏"}</button>
        <button class="ghost-btn sm-btn" type="button" data-essay-read="${material.id}">${read ? "已读" : "标记已读"}</button>
        <button class="ghost-btn sm-btn" type="button" data-essay-copy="${material.id}">复制金句</button>
      </div>`;

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
      copyGoldenSentences(material, article);
    });
  }

  function renderLibrary(store, data) {
    const list = $("#essayLibraryList");
    const empty = $("#essayLibraryEmpty");
    if (!list) return;

    const sourceFilter = $("#essaySourceFilter")?.value || "";
    const tagFilter = $("#essayTagFilter")?.value || "";
    const search = ($("#essaySearch")?.value || "").trim().toLowerCase();

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
          ...(x.material.topic_tags || [])
        ].join(" ").toLowerCase();
        return blob.includes(search);
      });
    }

    items.sort((a, b) => (b.article.publish_date || "").localeCompare(a.article.publish_date || ""));

    list.innerHTML = items.map(({ material, article }) => {
      const action = getUserAction(store, material.id);
      return `<article class="essay-library-item ${action?.starred ? "starred" : ""}">
        <div class="essay-library-head">
          <div>
            <h3>${escapeHtml(article.title || "")}</h3>
            <small>${escapeHtml(SOURCE_LABEL[article.source] || "")} · ${escapeHtml(article.publish_date || "")}</small>
          </div>
          <button class="ghost-btn sm-btn" type="button" data-essay-star="${material.id}">${action?.starred ? "★" : "☆"}</button>
        </div>
        <p class="essay-thesis">${escapeHtml(material.core_thesis || "")}</p>
        <div class="essay-tags">${renderTags(material.topic_tags)}</div>
        ${renderGoldenSentences(material.golden_sentences)}
        <div class="essay-actions">
          <a class="ghost-btn sm-btn" href="${escapeHtml(article.url)}" target="_blank" rel="noopener">原文</a>
          <button class="ghost-btn sm-btn" type="button" data-essay-copy="${material.id}">复制金句</button>
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
        if (material) copyGoldenSentences(material, article);
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

  function copyGoldenSentences(material, article) {
    const lines = (material.golden_sentences || []).map((s) => `「${s.text}」— 适合${s.usage || "通用"}`);
    const text = [
      article?.title || "",
      `论点：${material.core_thesis || ""}`,
      ...lines
    ].filter(Boolean).join("\n");
    navigator.clipboard?.writeText(text).then(() => {
      window.PlannerApp?.toast?.("金句已复制");
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
      renderAll(store);
    },
    renderAll
  };
})();
