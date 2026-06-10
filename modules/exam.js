(function () {
  const EXAM_TYPE = { guokao: "国考", guangdong: "广东省考", xuandiao: "广东选调" };

  function $(sel) { return document.querySelector(sel); }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
    return Math.ceil((target - now) / 86400000);
  }

  function formatCountdown(days) {
    if (days == null) return "--";
    if (days > 0) return `${days} 天`;
    if (days === 0) return "今天";
    return "已过";
  }

  function renderCountdown(store) {
    const settings = store.getSettings();
    const guokao = settings.guokao_exam_date;
    const guangdong = settings.guangdong_exam_date;
    const xuandiao = settings.xuandiao_exam_date;
    if ($("#guokaoCountdown")) $("#guokaoCountdown").textContent = formatCountdown(daysUntil(guokao));
    if ($("#guangdongCountdown")) $("#guangdongCountdown").textContent = formatCountdown(daysUntil(guangdong));
    if ($("#xuandiaoCountdown")) $("#xuandiaoCountdown").textContent = formatCountdown(daysUntil(xuandiao));
    if ($("#guokaoDateLabel")) $("#guokaoDateLabel").textContent = guokao ? `笔试 ${guokao}` : "点击设置日期";
    if ($("#guangdongDateLabel")) $("#guangdongDateLabel").textContent = guangdong ? `笔试 ${guangdong}` : "点击设置日期";
    if ($("#xuandiaoDateLabel")) $("#xuandiaoDateLabel").textContent = xuandiao ? `考试 ${xuandiao}` : "点击设置日期";
    if ($("#guokaoExamDate")) $("#guokaoExamDate").value = guokao || "";
    if ($("#guangdongExamDate")) $("#guangdongExamDate").value = guangdong || "";
    if ($("#xuandiaoExamDate")) $("#xuandiaoExamDate").value = xuandiao || "";
  }

  function switchTab(tab) {
    document.querySelectorAll(".exam-tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.examTab === tab));
    document.querySelectorAll(".exam-panel").forEach((panel) => panel.classList.remove("active"));
    const map = {
      study: "examStudyPanel",
      courses: "examCoursesPanel",
      summaries: "examSummariesPanel",
      calendar: "examCalendarPanel"
    };
    document.getElementById(map[tab])?.classList.add("active");
  }

  function questionTypeLabel(record) {
    if (record.question_category) {
      return window.PlannerExamTaxonomy?.formatQuestionType(record.question_category, record.question_subtype) || record.question_type;
    }
    return record.question_type || "";
  }

  function renderStudyQuestionFields(subject, category) {
    const tax = window.PlannerExamTaxonomy;
    const catSelect = $("#studyQuestionCategory");
    const subSelect = $("#studyQuestionSubtype");
    const hint = $("#studyQuestionHint");
    if (!tax || !catSelect || !subSelect) return;

    const categories = tax.getCategories(subject);
    const activeCategory = category && categories.includes(category) ? category : categories[0];
    catSelect.innerHTML = categories.map((c) =>
      `<option value="${escapeHtml(c)}" ${c === activeCategory ? "selected" : ""}>${escapeHtml(c)}</option>`
    ).join("");

    const meta = tax.getSubtypeMeta(subject, activeCategory);
    const subtypes = meta?.subtypes || [];
    subSelect.innerHTML = subtypes.map((s, i) =>
      `<option value="${escapeHtml(s)}" ${i === 0 ? "selected" : ""}>${escapeHtml(s)}</option>`
    ).join("");
    if (hint) hint.textContent = tax.formatExamHint(subject, activeCategory) || "";

    const isPaper = activeCategory === "套卷";
    const paperCheck = $("#studyIsPaper");
    if (paperCheck && isPaper) {
      paperCheck.checked = true;
      document.querySelectorAll(".paper-fields").forEach((el) => el.classList.remove("hidden"));
    }
  }

  function renderStudyRecords(store) {
    const list = $("#studyRecordsList");
    if (!list) return;
    const records = store.list("study_records").sort((a, b) => new Date(b.record_date) - new Date(a.record_date));
    list.innerHTML = records.map((r) => `
      <li>
        <strong>${r.record_date}</strong> · ${escapeHtml(r.subject)}
        ${questionTypeLabel(r) ? ` · ${escapeHtml(questionTypeLabel(r))}` : ""}
        · ${r.question_count} 题
        ${r.accuracy != null ? ` · 正确率 ${r.accuracy}%` : ""}
        ${r.is_paper ? ` · 纸质卷 ${escapeHtml(r.paper_name || "")} ${escapeHtml(r.paper_score || "")}` : ""}
        <div class="record-actions"><button class="ghost-btn sm-btn danger-text" data-del-study="${r.id}">删</button></div>
      </li>
    `).join("") || `<li class="muted">记录今天的刷题数据</li>`;
    list.querySelectorAll("[data-del-study]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await store.remove("study_records", btn.dataset.delStudy);
        renderStudyRecords(store);
        drawChart(store);
      });
    });
    drawChart(store);
  }

  function getRecordCategory(record) {
    if (record.question_category) return record.question_category;
    if (record.question_type && record.question_type.includes(" · ")) {
      return record.question_type.split(" · ")[0];
    }
    if (record.question_type) return record.question_type;
    return "未分类";
  }

  function getCategoriesWithData(records, subject) {
    const tax = window.PlannerExamTaxonomy;
    const ordered = tax?.getCategories(subject) || [];
    const withData = new Set(records.filter((r) => r.subject === subject).map(getRecordCategory));
    const result = ordered.filter((c) => withData.has(c));
    withData.forEach((c) => {
      if (!result.includes(c)) result.push(c);
    });
    return result;
  }

  function drawLineChart(canvas, records, { lineColor = "#f2a51f", dotColor = "#d77f0d", emptyText = "" } = {}) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width = canvas.parentElement.clientWidth - 8;
    const h = canvas.height = 100;
    ctx.clearRect(0, 0, w, h);
    if (!records.length) {
      if (emptyText) {
        ctx.fillStyle = "#7a684b";
        ctx.font = "12px sans-serif";
        ctx.fillText(emptyText, 8, h / 2);
      }
      return;
    }
    const pad = 18;
    const maxY = 100;
    ctx.strokeStyle = "#eddca6";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad, h - pad);
    ctx.lineTo(w - pad, h - pad);
    ctx.stroke();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    records.forEach((r, i) => {
      const x = pad + (i / Math.max(records.length - 1, 1)) * (w - pad * 2);
      const y = h - pad - (r.accuracy / maxY) * (h - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = dotColor;
    records.forEach((r, i) => {
      const x = pad + (i / Math.max(records.length - 1, 1)) * (w - pad * 2);
      const y = h - pad - (r.accuracy / maxY) * (h - pad * 2);
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    });
    const latest = records[records.length - 1];
    ctx.fillStyle = "#7a684b";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(`${latest.accuracy}%`, w - pad, pad);
    ctx.textAlign = "left";
  }

  function drawChart(store) {
    const grid = $("#accuracyChartsGrid");
    if (!grid) return;
    const subject = $("#studyChartSubject")?.value || "行测";
    const records = store.list("study_records").filter((r) => r.accuracy != null && r.subject === subject);
    const categories = getCategoriesWithData(records, subject);

    if (!categories.length) {
      grid.innerHTML = `<p class="muted chart-empty">记录 ${escapeHtml(subject)} 各题型的正确率后，这里会按模块显示趋势</p>`;
      return;
    }

    grid.innerHTML = categories.map((cat) => `
      <div class="chart-wrap chart-wrap-sm">
        <p class="chart-eyebrow">${escapeHtml(cat)}</p>
        <canvas data-chart-category="${escapeHtml(cat)}" height="100"></canvas>
      </div>
    `).join("");

    // 等布局完成后再画，避免 canvas 宽度为 0
    requestAnimationFrame(() => {
      grid.querySelectorAll("canvas[data-chart-category]").forEach((canvas) => {
        const cat = canvas.dataset.chartCategory;
        const catRecords = records
          .filter((r) => getRecordCategory(r) === cat)
          .sort((a, b) => new Date(a.record_date) - new Date(b.record_date))
          .slice(-14);
        drawLineChart(canvas, catRecords);
      });
    });
  }

  function courseDeadlineBadge(course) {
    const days = daysUntil(course.deadline_date);
    const remaining = Math.max(0, (course.total_chapters || 0) - (course.current_chapter || 0));
    if (days == null) return "";
    if (remaining === 0) return `<span class="course-ddl-badge done">已看完</span>`;
    if (days < 0) return `<span class="course-ddl-badge overdue">逾期 ${Math.abs(days)} 天</span>`;
    if (days === 0) return `<span class="course-ddl-badge urgent">今天截止</span>`;
    if (days <= 7) return `<span class="course-ddl-badge urgent">还剩 ${days} 天</span>`;
    return `<span class="course-ddl-badge">还剩 ${days} 天</span>`;
  }

  function coursePaceHint(course) {
    const current = course.current_chapter || 0;
    const total = course.total_chapters || 0;
    const remaining = Math.max(0, total - current);
    if (total === 0) return "设置总章节后开始跟踪进度";
    if (remaining === 0) return "这门课已经看完啦";
    const days = daysUntil(course.deadline_date);
    if (days == null) return `还剩 ${remaining} 章，设置截止日期后会提示学习节奏`;
    if (days < 0) return `还剩 ${remaining} 章，已逾期 ${Math.abs(days)} 天`;
    if (days === 0) return `还剩 ${remaining} 章，今天之内看完`;
    const perDay = remaining / days;
    const pace = perDay >= 1
      ? `建议每天 ${Math.ceil(perDay)} 章`
      : `建议每天 ${perDay.toFixed(1)} 章`;
    return `还剩 ${remaining} 章 · ${pace}`;
  }

  function courseCardClass(course) {
    const remaining = Math.max(0, (course.total_chapters || 0) - (course.current_chapter || 0));
    const days = daysUntil(course.deadline_date);
    if (remaining > 0 && days != null && days < 0) return "overdue";
    if (remaining > 0 && days != null && days <= 7) return "urgent";
    return "";
  }

  function renderCourses(store) {
    const wrap = $("#coursesList");
    if (!wrap) return;
    const courses = store.list("courses");
    wrap.innerHTML = courses.map((c) => {
      const current = c.current_chapter || 0;
      const total = c.total_chapters || 0;
      const pct = total ? Math.round((current / total) * 100) : 0;
      const cardClass = courseCardClass(c);
      return `<article class="course-card ${cardClass}" data-course-id="${c.id}">
        <div class="course-card-head">
          <h3>${escapeHtml(c.name)}</h3>
          ${courseDeadlineBadge(c)}
        </div>
        <div class="progress-bar"><span style="width:${pct}%"></span></div>
        <small class="muted">${current} / ${total} 章 · ${pct}%</small>
        <label class="course-progress-label">
          当前看到第
          <input type="number" min="0" max="${total || 999}" value="${current}" data-course-chapter />
          章
        </label>
        <label class="course-ddl-label">
          目标看完
          <input type="date" value="${c.deadline_date || ""}" data-course-deadline />
        </label>
        <p class="course-pace-hint">${escapeHtml(coursePaceHint(c))}</p>
        <button class="ghost-btn sm-btn danger-text" type="button" data-del-course="${c.id}">删除课程</button>
      </article>`;
    }).join("") || `<p class="empty-state">添加你的网课，跟踪学习进度</p>`;

    wrap.querySelectorAll("[data-course-chapter]").forEach((input) => {
      input.addEventListener("change", async () => {
        const card = input.closest("[data-course-id]");
        const course = store.getById("courses", card.dataset.courseId);
        if (!course) return;
        const total = course.total_chapters || 0;
        const next = Math.max(0, Math.min(total || 999, Number(input.value) || 0));
        input.value = next;
        await store.update("courses", course.id, { current_chapter: next });
        renderCourses(store);
      });
    });

    wrap.querySelectorAll("[data-course-deadline]").forEach((input) => {
      input.addEventListener("change", async () => {
        const card = input.closest("[data-course-id]");
        const course = store.getById("courses", card.dataset.courseId);
        if (!course) return;
        await store.update("courses", course.id, { deadline_date: input.value });
        renderCourses(store);
      });
    });

    wrap.querySelectorAll("[data-del-course]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await store.remove("courses", btn.dataset.delCourse);
        renderCourses(store);
      });
    });
  }

  function renderSummaries(store) {
    const list = $("#examSummariesList");
    if (!list) return;
    list.innerHTML = store.list("daily_summaries")
      .sort((a, b) => new Date(b.summary_date) - new Date(a.summary_date))
      .map((s) => `
        <li>
          <strong>${s.summary_date}</strong>
          ${s.plan_done ? " · 今日任务完成 ✓" : ""}
          ${s.reflection ? `<br>${escapeHtml(s.reflection)}` : ""}
          ${s.wolai_link ? `<br><a href="${escapeHtml(s.wolai_link)}" target="_blank" rel="noopener">wolai 笔记</a>` : ""}
        </li>
      `).join("") || `<li class="muted">在首页填写今日总结后会显示在这里</li>`;
  }

  function renderExamEvents(store) {
    const list = $("#examEventsList");
    if (!list) return;
    list.innerHTML = store.list("exam_events")
      .sort((a, b) => new Date(a.event_date) - new Date(b.event_date))
      .map((e) => `
        <li>
          <strong>${e.event_date}</strong> · [${EXAM_TYPE[e.exam_type] || e.exam_type}] ${escapeHtml(e.title)}
          <button class="ghost-btn sm-btn danger-text" data-del-event="${e.id}">删</button>
        </li>
      `).join("") || `<li class="muted">添加报名、笔试、面试等重要节点</li>`;
    list.querySelectorAll("[data-del-event]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await store.remove("exam_events", btn.dataset.delEvent);
        renderExamEvents(store);
      });
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  window.PlannerExam = {
    init(store) {
      document.querySelectorAll(".exam-tab").forEach((btn) => {
        btn.addEventListener("click", () => {
          switchTab(btn.dataset.examTab);
          if (btn.dataset.examTab === "study") drawChart(store);
        });
      });

      renderStudyQuestionFields($("#studySubject")?.value || "行测");

      $("#studySubject")?.addEventListener("change", (e) => {
        renderStudyQuestionFields(e.target.value);
      });
      $("#studyQuestionCategory")?.addEventListener("change", (e) => {
        renderStudyQuestionFields($("#studySubject").value, e.target.value);
      });

      $("#studyIsPaper")?.addEventListener("change", (e) => {
        document.querySelectorAll(".paper-fields").forEach((el) => el.classList.toggle("hidden", !e.target.checked));
      });

      $("#studyChartSubject")?.addEventListener("change", () => drawChart(store));

      $("#studyRecordForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const subject = $("#studySubject").value;
        const category = $("#studyQuestionCategory").value;
        const subtype = $("#studyQuestionSubtype").value;
        const questionType = window.PlannerExamTaxonomy?.formatQuestionType(category, subtype) || category;
        await store.add("study_records", {
          record_date: new Date().toISOString().slice(0, 10),
          subject,
          question_category: category,
          question_subtype: subtype,
          question_type: questionType,
          question_count: Number($("#studyQuestionCount").value) || 0,
          accuracy: $("#studyAccuracy").value ? Number($("#studyAccuracy").value) : null,
          is_paper: $("#studyIsPaper").checked,
          paper_name: $("#studyPaperName").value.trim(),
          paper_score: $("#studyPaperScore").value.trim()
        });
        e.target.reset();
        document.querySelectorAll(".paper-fields").forEach((el) => el.classList.add("hidden"));
        renderStudyQuestionFields($("#studySubject").value || "行测");
        renderStudyRecords(store);
      });

      $("#addCourseBtn")?.addEventListener("click", async () => {
        const data = await window.PlannerDialog.form({
          title: "添加课程",
          fields: [
            { name: "name", label: "课程名称", required: true, placeholder: "如：粉笔行测2026" },
            { name: "total_chapters", label: "总章节数", type: "number", value: "20", min: 1, required: true },
            { name: "current_chapter", label: "当前看到第几章", type: "number", value: "0", min: 0 },
            { name: "deadline_date", label: "目标看完日期（选填）", type: "date" }
          ]
        });
        if (!data?.name) return;
        const total = Number(data.total_chapters) || 0;
        const current = Math.max(0, Math.min(total, Number(data.current_chapter) || 0));
        await store.add("courses", {
          name: data.name,
          total_chapters: total,
          current_chapter: current,
          deadline_date: data.deadline_date || ""
        });
        renderCourses(store);
      });

      $("#addExamEventBtn")?.addEventListener("click", async () => {
        const data = await window.PlannerDialog.form({
          title: "添加考试事件",
          fields: [
            { name: "title", label: "事件名称", required: true, placeholder: "如：国考笔试" },
            { name: "event_date", label: "日期", type: "date", value: new Date().toISOString().slice(0, 10), required: true },
            { name: "exam_type", label: "考试类型", type: "select", value: "guokao", options: [
              { value: "guokao", label: "国考" },
              { value: "guangdong", label: "广东省考" },
              { value: "xuandiao", label: "广东选调" }
            ] }
          ]
        });
        if (!data?.title || !data.event_date) return;
        await store.add("exam_events", { title: data.title, event_date: data.event_date, exam_type: data.exam_type });
        renderExamEvents(store);
      });

      $("#guokaoExamDate")?.addEventListener("change", async (e) => {
        await store.updateSettings({ guokao_exam_date: e.target.value });
        renderCountdown(store);
      });
      $("#guangdongExamDate")?.addEventListener("change", async (e) => {
        await store.updateSettings({ guangdong_exam_date: e.target.value });
        renderCountdown(store);
      });
      $("#xuandiaoExamDate")?.addEventListener("change", async (e) => {
        await store.updateSettings({ xuandiao_exam_date: e.target.value });
        renderCountdown(store);
      });

      store.onChange(() => {
        renderCountdown(store);
        renderStudyRecords(store);
        renderCourses(store);
        renderSummaries(store);
        renderExamEvents(store);
      });

      renderCountdown(store);
      renderStudyRecords(store);
      renderCourses(store);
      renderSummaries(store);
      renderExamEvents(store);
      window.addEventListener("resize", () => drawChart(store));
    },
    renderAll(store) {
      renderCountdown(store);
      renderStudyRecords(store);
      renderCourses(store);
      renderSummaries(store);
      renderExamEvents(store);
      drawChart(store);
    },
    renderSummaries
  };
})();
