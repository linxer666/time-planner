(function () {
  const EXAM_SUBTYPE = { practice: "刷题", course: "看课", review: "复盘" };
  const TAG_CLASS = {
    intern: "business",
    practice: "onboarding",
    course: "growth",
    review: "pm"
  };

  let selectedDate = new Date().toISOString().slice(0, 10);
  let calendarMonth = new Date();

  function $(sel) { return document.querySelector(sel); }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatDateLabel(dateStr) {
    const d = new Date(dateStr + "T12:00:00");
    const now = new Date();
    const isToday = dateStr === today();
    const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(d);
    const md = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(d);
    return isToday ? `今天 · ${weekday}` : `${md} · ${weekday}`;
  }

  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
    return Math.ceil((target - now) / 86400000);
  }

  function tasksForDate(store, dateStr) {
    return store.list("daily_tasks")
      .filter((t) => t.task_date === dateStr)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || new Date(a.created_at) - new Date(b.created_at));
  }

  function taskTagInfo(store, task) {
    if (task.track === "intern") {
      const project = task.project_id ? store.getById("projects", task.project_id) : null;
      return {
        label: project ? project.name : "实习",
        cls: TAG_CLASS.intern
      };
    }
    const subtype = task.exam_subtype || "practice";
    return {
      label: `考公·${EXAM_SUBTYPE[subtype] || "刷题"}`,
      cls: TAG_CLASS[subtype] || TAG_CLASS.practice
    };
  }

  function renderProjectOptions(store) {
    const select = $("#dailyTaskProject");
    if (!select) return;
    const projects = store.list("projects");
    select.innerHTML = `<option value="">选择项目（选填）</option>${projects.map((p) =>
      `<option value="${p.id}">${escapeHtml(p.name)}</option>`
    ).join("")}`;
  }

  function bindTaskCards(store, list, { allowDelete, onUpdate }) {
    if (!list) return;
    list.querySelectorAll("[data-daily-task]").forEach((card) => {
      const id = card.dataset.dailyTask;
      card.querySelector('input[type="checkbox"]')?.addEventListener("change", async (e) => {
        await store.update("daily_tasks", id, { done: e.target.checked });
        onUpdate?.();
      });
      if (allowDelete) {
        card.querySelector("[data-del-daily-task]")?.addEventListener("click", async () => {
          await store.remove("daily_tasks", id);
          onUpdate?.();
        });
      }
    });
  }

  function renderTaskList(store, { listId, emptyId, badgeId, dateStr, allowDelete, onUpdate }) {
    const list = $(listId);
    const empty = emptyId ? $(emptyId) : null;
    const badge = badgeId ? $(badgeId) : null;
    const tasks = tasksForDate(store, dateStr);
    const done = tasks.filter((t) => t.done).length;

    if (badge) {
      badge.textContent = tasks.length ? `${done}/${tasks.length}` : "0/0";
      badge.classList.toggle("done", tasks.length > 0 && done === tasks.length);
    }

    if (!list) return;
    list.innerHTML = tasks.map((task) => {
      const tag = taskTagInfo(store, task);
      const deleteBtn = allowDelete
        ? `<button class="ghost-btn sm-btn danger-text" type="button" data-del-daily-task="${task.id}">删</button>`
        : "";
      return `<article class="today-task ${task.done ? "done" : ""}" data-daily-task="${task.id}">
        <input type="checkbox" ${task.done ? "checked" : ""} aria-label="完成" />
        <div>
          <strong>${escapeHtml(task.title)}</strong>
          <small><span class="tag-pill tag-${tag.cls}">${escapeHtml(tag.label)}</span></small>
        </div>
        ${deleteBtn}
      </article>`;
    }).join("");

    empty?.classList.toggle("hidden", tasks.length > 0);
    bindTaskCards(store, list, { allowDelete, onUpdate });
  }

  function renderDailyTasks(store) {
    $("#selectedDateEyebrow").textContent = selectedDate === today() ? "今天" : "选中日期";
    $("#selectedDateTitle").textContent = selectedDate === today() ? "今日任务" : formatDateLabel(selectedDate);
    renderTaskList(store, {
      listId: "#dailyTaskList",
      emptyId: "#dailyTaskEmpty",
      badgeId: "#planStatusBadge",
      dateStr: selectedDate,
      allowDelete: true,
      onUpdate: () => {
        renderDailyTasks(store);
        renderReviewTasks(store);
        renderWeeklyRate(store);
        renderCalendar(store);
        renderSummaryForm(store);
      }
    });
  }

  function renderReviewTasks(store) {
    renderTaskList(store, {
      listId: "#reviewTaskList",
      emptyId: "#reviewTaskEmpty",
      badgeId: "#reviewTaskBadge",
      dateStr: today(),
      allowDelete: false,
      onUpdate: () => {
        renderDailyTasks(store);
        renderReviewTasks(store);
        renderWeeklyRate(store);
        renderCalendar(store);
        renderSummaryForm(store);
      }
    });
  }

  function renderCalendar(store) {
    const grid = $("#dashCalendarGrid");
    const title = $("#monthTitle");
    if (!grid || !title) return;

    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    title.textContent = `${year}年${month + 1}月`;

    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const allTasks = store.list("daily_tasks");

    let html = "";
    for (let i = 0; i < startOffset; i++) html += `<div class="day-cell empty-day"></div>`;
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayTasks = allTasks.filter((t) => t.task_date === dateStr);
      const dots = dayTasks.slice(0, 4).map((t) => {
        const tag = taskTagInfo(store, t);
        return `<i class="dot ${tag.cls}"></i>`;
      }).join("");
      const selected = dateStr === selectedDate ? "selected" : "";
      const isToday = dateStr === today() ? "today" : "";
      html += `<button type="button" class="day-cell dash-day ${selected} ${isToday}" data-date="${dateStr}">
        <span class="day-num">${day}</span>
        <span class="day-dots">${dots}</span>
        ${dayTasks.length ? `<small>${dayTasks.filter((t) => t.done).length}/${dayTasks.length}</small>` : ""}
      </button>`;
    }
    grid.innerHTML = html;
    grid.querySelectorAll("[data-date]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedDate = btn.dataset.date;
        renderDailyTasks(store);
        renderCalendar(store);
      });
    });
  }

  function renderSummaryForm(store) {
    const summary = store.list("daily_summaries").find((s) => s.summary_date === today());
    const badge = $("#summaryStatusBadge");
    const tasks = tasksForDate(store, today());
    const done = tasks.filter((t) => t.done).length;
    const hasReflection = !!(summary?.reflection || summary?.wolai_link);

    if (summary) {
      $("#summaryReflection").value = summary.reflection || "";
      $("#summaryWolaiLink").value = summary.wolai_link || "";
    } else {
      $("#summaryReflection").value = "";
      $("#summaryWolaiLink").value = "";
    }

    if (badge) {
      if (hasReflection) {
        badge.textContent = "已填写";
        badge.classList.add("done");
      } else {
        badge.textContent = tasks.length ? `${done}/${tasks.length}` : "未填写";
        badge.classList.toggle("done", tasks.length > 0 && done === tasks.length);
      }
    }

    renderReviewTasks(store);
  }

  function renderWeeklyRate(store) {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const recentTasks = store.list("daily_tasks").filter((t) => new Date(t.task_date) >= weekAgo);
    const taskRate = recentTasks.length
      ? recentTasks.filter((t) => t.done).length / recentTasks.length
      : 0;
    const studyRecords = store.list("study_records").filter((r) => new Date(r.record_date) >= weekAgo).length;
    const examRate = Math.min(studyRecords / 7, 1);
    const rate = Math.round(((taskRate + examRate) / 2) * 100);
    $("#weeklyCompletionRate").textContent = `${rate}%`;
  }

  function renderUrgentTasks(store) {
    const list = $("#urgentTasksList");
    if (!list) return;
    const urgent = window.PlannerProjects?.getUrgentTasks(store) || [];
    list.innerHTML = urgent.map((t) => {
      const project = store.getById("projects", t.project_id);
      return `<li><strong>${escapeHtml(t.title)}</strong> · ${escapeHtml(project?.name || "项目")} · 截止 ${t.deadline}</li>`;
    }).join("") || `<li class="muted">暂无 3 天内到期的任务</li>`;
  }

  function updateTrackFields() {
    const track = $("#dailyTaskTrack")?.value || "intern";
    $("#dailyTaskProjectWrap")?.classList.toggle("hidden", track !== "intern");
    $("#dailyTaskExamWrap")?.classList.toggle("hidden", track !== "exam");
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function renderReview(store) {
    renderSummaryForm(store);
    renderWeeklyRate(store);
    renderUrgentTasks(store);
    window.PlannerProjects?.renderWeeklyGoals?.(store);
  }

  function renderAll(store) {
    renderProjectOptions(store);
    renderDailyTasks(store);
    renderCalendar(store);
    renderReview(store);
  }

  window.PlannerDashboard = {
    init(store, app) {
      $("#dailyTaskTrack")?.addEventListener("change", updateTrackFields);
      updateTrackFields();

      $("#addDailyTaskForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const title = $("#dailyTaskTitle").value.trim();
        if (!title) return;
        const track = $("#dailyTaskTrack").value;
        const existing = tasksForDate(store, selectedDate);
        await store.add("daily_tasks", {
          task_date: selectedDate,
          title,
          track,
          project_id: track === "intern" ? ($("#dailyTaskProject").value || null) : null,
          exam_subtype: track === "exam" ? $("#dailyTaskExamSubtype").value : null,
          done: false,
          sort_order: existing.length
        });
        $("#dailyTaskTitle").value = "";
        app.toast("任务已添加");
        renderDailyTasks(store);
        renderCalendar(store);
      });

      $("#jumpTodayBtn")?.addEventListener("click", () => {
        selectedDate = today();
        calendarMonth = new Date();
        renderDailyTasks(store);
        renderCalendar(store);
      });

      $("#prevMonthBtn")?.addEventListener("click", () => {
        calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
        renderCalendar(store);
      });
      $("#nextMonthBtn")?.addEventListener("click", () => {
        calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
        renderCalendar(store);
      });

      $("#dailySummaryForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const tasks = tasksForDate(store, today());
        const done = tasks.filter((t) => t.done).length;
        await store.upsertByDate("daily_summaries", "summary_date", {
          summary_date: today(),
          plan_done: tasks.length > 0 && done === tasks.length,
          question_count: null,
          accuracy: null,
          reflection: $("#summaryReflection").value.trim(),
          wolai_link: $("#summaryWolaiLink").value.trim()
        });
        app.toast("今日总结已保存");
        renderAll(store);
        window.PlannerExam?.renderSummaries?.(store);
      });

      store.onChange(() => renderAll(store));
      renderAll(store);
    },
    renderAll,
    renderReview
  };
})();
