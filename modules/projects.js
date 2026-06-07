(function () {
  const PRIORITY_LABEL = { high: "高", medium: "中", low: "低" };
  const STATUS_LABEL = { todo: "待做", doing: "进行中", done: "完成" };
  const STATUS_CYCLE = ["todo", "doing", "done"];
  const PRIORITY_CYCLE = ["low", "medium", "high"];
  const STATUS_TAG = { todo: "onboarding", doing: "growth", done: "business" };
  const PRIORITY_TAG = { high: "pm", medium: "onboarding", low: "growth" };
  let selectedProjectId = null;
  const collapsedMilestones = new Set();

  function $(sel) { return document.querySelector(sel); }

  function weekKey(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay() || 7;
    d.setDate(d.getDate() - day + 1);
    return d.toISOString().slice(0, 10);
  }

  function weekLabel(date = new Date()) {
    const start = new Date(weekKey(date) + "T12:00:00");
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const fmt = (d) => new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(d);
    return `本周 ${fmt(start)} - ${fmt(end)}`;
  }

  function projectProgress(store, projectId) {
    const tasks = store.list("tasks").filter((t) => t.project_id === projectId);
    if (!tasks.length) return 0;
    return Math.round((tasks.filter((t) => t.status === "done").length / tasks.length) * 100);
  }

  function renderProjectList(store) {
    const list = $("#projectList");
    if (!list) return;
    const projects = store.list("projects");
    if (!selectedProjectId && projects[0]) selectedProjectId = projects[0].id;
    list.innerHTML = projects.map((p) => {
      const pct = projectProgress(store, p.id);
      return `<li><button type="button" class="${p.id === selectedProjectId ? "active" : ""}" data-id="${p.id}">
        <strong>${escapeHtml(p.name)}</strong>
        <div class="progress-mini"><span style="width:${pct}%"></span></div>
        <small class="muted">${pct}% 完成</small>
      </button></li>`;
    }).join("") || `<li class="muted">暂无项目</li>`;
    list.querySelectorAll("button[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedProjectId = btn.dataset.id;
        renderProjectList(store);
        renderProjectDetail(store);
      });
    });
  }

  function renderProjectDetail(store) {
    const area = $("#projectDetailArea");
    if (!area) return;
    const project = store.getById("projects", selectedProjectId);
    if (!project) {
      area.innerHTML = `<p class="empty-state">选择一个项目，或新建一个项目开始管理。</p>`;
      return;
    }
    const milestones = store.list("milestones").filter((m) => m.project_id === project.id);
    const tasks = store.list("tasks").filter((t) => t.project_id === project.id);
    const pct = projectProgress(store, project.id);
    const milestoneBlocks = milestones.map((ms) => milestoneSection(ms, tasks.filter((t) => t.milestone_id === ms.id))).join("");
    const unassigned = tasks.filter((t) => !t.milestone_id);

    area.innerHTML = `
      <div class="project-detail-layout">
        <div class="project-detail-head">
          <div class="section-head compact">
            <div>
              <p class="eyebrow">项目详情</p>
              <h2>${escapeHtml(project.name)}</h2>
            </div>
            <div class="task-actions">
              <button class="ghost-btn sm-btn" id="addMilestoneBtn">+ 里程碑</button>
              <button class="ghost-btn sm-btn danger-text" id="deleteProjectBtn">删除项目</button>
            </div>
          </div>
          <p class="project-desc">${escapeHtml(project.description || "暂无描述")}</p>
          <div class="project-progress-wrap">
            <div class="progress-bar"><span style="width:${pct}%"></span></div>
            <small class="muted">${tasks.filter((t) => t.status === "done").length} / ${tasks.length} 任务完成</small>
          </div>
        </div>
        <div class="project-detail-scroll">
          <div class="milestone-stack">
            ${milestoneBlocks || `<div class="milestone-empty"><p>还没有里程碑</p><small>按阶段拆分任务，进度会更清晰</small></div>`}
            ${unassigned.length ? otherTasksSection(unassigned) : ""}
          </div>
        </div>
        <form class="quick-form inline-form project-quick-add" id="quickTaskForm">
          <input id="quickTaskTitle" placeholder="快速添加任务（只需标题）" required />
          <button class="primary-btn sm-btn" type="submit">添加</button>
        </form>
      </div>
    `;

    $("#addMilestoneBtn")?.addEventListener("click", async () => {
      const data = await window.PlannerDialog.form({
        title: "添加里程碑",
        fields: [{ name: "name", label: "里程碑名称", required: true, placeholder: "如：完成数据预处理" }]
      });
      const name = data?.name;
      if (!name) return;
      await store.add("milestones", { project_id: project.id, name, sort_order: milestones.length, result_note: "" });
      renderProjectDetail(store);
      renderProjectList(store);
    });

    $("#deleteProjectBtn")?.addEventListener("click", async () => {
      const ok = await window.PlannerDialog.confirm("删除项目会同时删除其里程碑和任务，确定吗？", "删除项目");
      if (!ok) return;
      for (const t of tasks) await store.remove("tasks", t.id);
      for (const m of milestones) await store.remove("milestones", m.id);
      await store.remove("projects", project.id);
      selectedProjectId = store.list("projects")[0]?.id || null;
      renderProjectList(store);
      renderProjectDetail(store);
    });

    area.querySelectorAll("[data-ms-result]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ms = store.getById("milestones", btn.dataset.msResult);
        if (!ms) return;
        const data = await window.PlannerDialog.form({
          title: `里程碑结果 · ${ms.name}`,
          submitLabel: "保存",
          fields: [{
            name: "result_note",
            label: "阶段成果记录",
            type: "textarea",
            rows: 6,
            value: ms.result_note || "",
            placeholder: "这个里程碑完成了什么？产出物、数据指标、链接、心得…"
          }]
        });
        if (!data) return;
        await store.update("milestones", ms.id, { result_note: data.result_note || "" });
        renderProjectDetail(store);
      });
    });

    area.querySelectorAll("[data-toggle-ms]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.toggleMs;
        if (collapsedMilestones.has(id)) collapsedMilestones.delete(id);
        else collapsedMilestones.add(id);
        renderProjectDetail(store);
      });
    });

    area.querySelectorAll("[data-del-milestone]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const ok = await window.PlannerDialog.confirm("删除里程碑后，其中任务会移到「其他任务」，确定吗？", "删除里程碑");
        if (!ok) return;
        const msId = btn.dataset.delMilestone;
        for (const t of tasks.filter((t) => t.milestone_id === msId)) {
          await store.update("tasks", t.id, { milestone_id: null });
        }
        await store.remove("milestones", msId);
        renderProjectDetail(store);
        renderProjectList(store);
      });
    });

    area.querySelectorAll("[data-add-task]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const data = await window.PlannerDialog.form({
          title: "添加任务",
          fields: [{ name: "title", label: "任务标题", required: true, placeholder: "如：写数据清洗脚本" }]
        });
        const title = data?.title;
        if (!title) return;
        await store.add("tasks", {
          project_id: project.id,
          milestone_id: btn.dataset.addTask,
          title,
          deadline: "",
          priority: "medium",
          status: "todo"
        });
        renderProjectDetail(store);
        renderProjectList(store);
      });
    });

    area.querySelectorAll(".project-task").forEach((card) => bindTaskCard(store, card));
    $("#quickTaskForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = $("#quickTaskTitle").value.trim();
      if (!title) return;
      const firstMs = milestones[0]?.id || null;
      await store.add("tasks", {
        project_id: project.id,
        milestone_id: firstMs,
        title,
        deadline: "",
        priority: "medium",
        status: "todo"
      });
      $("#quickTaskTitle").value = "";
      renderProjectDetail(store);
      renderProjectList(store);
    });
  }

  function otherTasksSection(tasks) {
    const collapsed = collapsedMilestones.has("__other__");
    return `<section class="milestone-section loose ${collapsed ? "collapsed" : ""}">
      <div class="milestone-header">
        <button class="milestone-toggle" type="button" data-toggle-ms="__other__" aria-expanded="${!collapsed}">${collapsed ? "▸" : "▾"}</button>
        <div class="milestone-title-wrap">
          <h3>其他任务</h3>
          <small class="muted">未归入里程碑 · ${tasks.length} 项</small>
        </div>
      </div>
      <div class="project-task-list">${tasks.map((t) => taskCard(t)).join("")}</div>
    </section>`;
  }

  function milestoneSection(ms, msTasks) {
    const done = msTasks.filter((t) => t.status === "done").length;
    const collapsed = collapsedMilestones.has(ms.id);
    const hasResult = !!(ms.result_note && ms.result_note.trim());
    return `<section class="milestone-section ${collapsed ? "collapsed" : ""}">
      <div class="milestone-header">
        <button class="milestone-toggle" type="button" data-toggle-ms="${ms.id}" aria-expanded="${!collapsed}">${collapsed ? "▸" : "▾"}</button>
        <div class="milestone-title-wrap">
          <h3>${escapeHtml(ms.name)}</h3>
          <small class="muted">${msTasks.length ? `${done}/${msTasks.length} 完成` : "暂无任务"}${hasResult ? " · 已记录结果" : ""}</small>
        </div>
        <div class="milestone-actions">
          <button class="ghost-btn sm-btn ${hasResult ? "has-note" : ""}" type="button" data-ms-result="${ms.id}" title="记录里程碑结果">结果</button>
          <button class="ghost-btn sm-btn" type="button" data-add-task="${ms.id}">+ 任务</button>
          <button class="icon-btn subtle" type="button" data-del-milestone="${ms.id}" title="删除里程碑">×</button>
        </div>
      </div>
      <div class="project-task-list">
        ${msTasks.map((t) => taskCard(t)).join("") || `<p class="inline-empty">点「+ 任务」添加</p>`}
      </div>
      ${hasResult && collapsed ? `<p class="milestone-result-preview">${escapeHtml(ms.result_note.trim().slice(0, 80))}${ms.result_note.trim().length > 80 ? "…" : ""}</p>` : ""}
    </section>`;
  }

  function taskCard(task) {
    const urgent = task.deadline && daysUntil(task.deadline) <= 3 && task.status !== "done";
    const status = task.status || "todo";
    const priority = task.priority || "medium";
    const deadlineLabel = task.deadline
      ? new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(task.deadline + "T12:00:00"))
      : "截止";
    return `<article class="project-task ${status === "done" ? "done" : ""} ${urgent ? "urgent" : ""}" data-task-id="${task.id}">
      <input type="checkbox" ${status === "done" ? "checked" : ""} aria-label="完成" />
      <div class="project-task-body">
        <strong>${escapeHtml(task.title)}</strong>
        <div class="project-task-meta">
          <button class="tag-pill tag-${STATUS_TAG[status]}" type="button" data-cycle-status="${status}">${STATUS_LABEL[status]}</button>
          <button class="tag-pill tag-${PRIORITY_TAG[priority]}" type="button" data-cycle-priority="${priority}">${PRIORITY_LABEL[priority]}优先</button>
          <label class="task-date-chip ${task.deadline ? "" : "empty"}" title="设置截止日期">
            <span>${deadlineLabel}</span>
            <input class="task-date-input" data-field="deadline" type="date" value="${task.deadline || ""}" />
          </label>
        </div>
      </div>
      <button class="icon-btn subtle danger-text" type="button" data-delete-task="${task.id}" title="删除任务">×</button>
    </article>`;
  }

  function nextInCycle(list, current) {
    const idx = list.indexOf(current);
    return list[(idx + 1) % list.length];
  }

  function bindTaskCard(store, card) {
    const id = card.dataset.taskId;
    card.querySelector('input[type="checkbox"]')?.addEventListener("change", async (e) => {
      await store.update("tasks", id, { status: e.target.checked ? "done" : "todo" });
      renderProjectDetail(store);
      renderProjectList(store);
    });
    card.querySelector("[data-cycle-status]")?.addEventListener("click", async (e) => {
      e.preventDefault();
      const next = nextInCycle(STATUS_CYCLE, e.currentTarget.dataset.cycleStatus);
      await store.update("tasks", id, { status: next });
      renderProjectDetail(store);
      renderProjectList(store);
    });
    card.querySelector("[data-cycle-priority]")?.addEventListener("click", async (e) => {
      e.preventDefault();
      const next = nextInCycle(PRIORITY_CYCLE, e.currentTarget.dataset.cyclePriority);
      await store.update("tasks", id, { priority: next });
      renderProjectDetail(store);
      renderProjectList(store);
    });
    card.querySelector("[data-field]")?.addEventListener("change", async (e) => {
      await store.update("tasks", id, { [e.target.dataset.field]: e.target.value });
      renderProjectDetail(store);
      renderProjectList(store);
    });
    card.querySelector("[data-delete-task]")?.addEventListener("click", async () => {
      await store.remove("tasks", id);
      renderProjectDetail(store);
      renderProjectList(store);
    });
  }

  function renderWeeklyGoals(store) {
    const list = $("#weeklyGoalsList");
    const dashList = $("#dashboardWeeklyGoals");
    const goals = store.list("weekly_goals").filter((g) => g.week_key === weekKey());
    const weekLabelEl = $("#weeklyWeekLabel");
    if (weekLabelEl) weekLabelEl.textContent = weekLabel();
    const html = goals.map((g) => `<li>${escapeHtml(g.content)} <button class="ghost-btn sm-btn" data-del-goal="${g.id}">删</button></li>`).join("");
    if (list) {
      list.innerHTML = html || `<li class="muted">还没有重点，写一条试试</li>`;
      list.querySelectorAll("[data-del-goal]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          await store.remove("weekly_goals", btn.dataset.delGoal);
          renderWeeklyGoals(store);
        });
      });
    }
    if (dashList) {
      dashList.innerHTML = goals.length
        ? goals.map((g) => `<li>${escapeHtml(g.content)}</li>`).join("")
        : `<li class="muted">去实习项目页设置本周重点</li>`;
    }
  }

  function renderTechTodos(store) {
    const list = $("#techTodosList");
    if (!list) return;
    list.innerHTML = store.list("tech_todos").map((item) => `
      <li class="${item.done ? "done" : ""}">
        <input type="checkbox" data-tech-id="${item.id}" ${item.done ? "checked" : ""} />
        <span>${escapeHtml(item.content)}</span>
        <button class="ghost-btn sm-btn" data-del-tech="${item.id}">删</button>
      </li>
    `).join("") || `<li class="muted">添加想学的技术方向</li>`;
    list.querySelectorAll("[data-tech-id]").forEach((cb) => {
      cb.addEventListener("change", async () => {
        await store.update("tech_todos", cb.dataset.techId, { done: cb.checked });
        renderTechTodos(store);
      });
    });
    list.querySelectorAll("[data-del-tech]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await store.remove("tech_todos", btn.dataset.delTech);
        renderTechTodos(store);
      });
    });
  }

  function renderWorkLogs(store) {
    const list = $("#workLogsList");
    if (!list) return;
    list.innerHTML = store.list("work_logs")
      .sort((a, b) => new Date(b.log_date) - new Date(a.log_date))
      .slice(0, 10)
      .map((log) => `<li><strong>${log.log_date}</strong><br>${escapeHtml(log.content)}</li>`)
      .join("") || `<li class="muted">还没有日志</li>`;
  }

  function daysUntil(dateStr) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr); target.setHours(0, 0, 0, 0);
    return Math.ceil((target - today) / 86400000);
  }

  function getUrgentTasks(store) {
    return store.list("tasks").filter((t) => t.deadline && t.status !== "done" && daysUntil(t.deadline) <= 3)
      .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  window.PlannerProjects = {
    init(store) {
      $("#addProjectBtn")?.addEventListener("click", async () => {
        const data = await window.PlannerDialog.form({
          title: "新建实习项目",
          fields: [
            { name: "name", label: "项目名称", required: true, placeholder: "如：CV模型优化" },
            { name: "description", label: "项目描述（选填）", placeholder: "简要说明项目目标" }
          ]
        });
        const name = data?.name;
        if (!name) return;
        const p = await store.add("projects", { name, description: data.description || "", start_date: "", end_date: "" });
        selectedProjectId = p.id;
        renderProjectList(store);
        renderProjectDetail(store);
      });

      $("#weeklyGoalForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const content = $("#weeklyGoalInput").value.trim();
        if (!content) return;
        const current = store.list("weekly_goals").filter((g) => g.week_key === weekKey());
        if (current.length >= 3) {
          await window.PlannerDialog.alert("本周重点最多 3 条");
          return;
        }
        await store.add("weekly_goals", { week_key: weekKey(), content, sort_order: current.length });
        $("#weeklyGoalInput").value = "";
        renderWeeklyGoals(store);
      });

      $("#techTodoForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const content = $("#techTodoInput").value.trim();
        if (!content) return;
        await store.add("tech_todos", { content, done: false });
        $("#techTodoInput").value = "";
        renderTechTodos(store);
      });

      $("#workLogForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const content = $("#workLogInput").value.trim();
        if (!content) return;
        await store.add("work_logs", { log_date: new Date().toISOString().slice(0, 10), content });
        $("#workLogInput").value = "";
        renderWorkLogs(store);
      });

      store.onChange(() => {
        renderProjectList(store);
        renderProjectDetail(store);
        renderWeeklyGoals(store);
        renderTechTodos(store);
        renderWorkLogs(store);
      });

      renderProjectList(store);
      renderProjectDetail(store);
      renderWeeklyGoals(store);
      renderTechTodos(store);
      renderWorkLogs(store);
    },
    getUrgentTasks,
    projectProgress,
    weekKey,
    renderWeeklyGoals
  };
})();
