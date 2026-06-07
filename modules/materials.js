(function () {
  function $(sel) { return document.querySelector(sel); }

  function taxonomy() {
    return window.PlannerExamTaxonomy;
  }

  function materialTagGroups() {
    return taxonomy()?.getMaterialTagGroups?.() || [];
  }

  function allMaterialTags() {
    return taxonomy()?.getAllMaterialTags?.() || ["其他"];
  }

  function normalizeTag(tag) {
    return taxonomy()?.normalizeMaterialTag?.(tag) || tag || "其他";
  }

  function tagPillClass(tag) {
    if (tag.startsWith("行测")) return "tag-onboarding";
    if (tag.startsWith("申论")) return "tag-growth";
    if (tag.startsWith("实习")) return "tag-business";
    return "tag-pm";
  }

  function formatSize(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
  }

  function renderTagFilterOptions() {
    const select = $("#materialTagFilter");
    if (!select) return;
    const current = select.value;
    const groups = materialTagGroups();
    select.innerHTML = `<option value="">全部标签</option>${groups.map((group) => {
      const options = group.options.map((opt) =>
        `<option value="${escapeAttr(opt.value)}">${escapeHtml(opt.label)}</option>`
      ).join("");
      return `<optgroup label="${escapeAttr(group.group)}">${options}</optgroup>`;
    }).join("")}`;
    if (current && [...select.options].some((opt) => opt.value === current)) {
      select.value = current;
    }
  }

  function filteredMaterials(store) {
    const q = ($("#materialSearch")?.value || "").trim().toLowerCase();
    const tag = $("#materialTagFilter")?.value || "";
    return store.list("materials").filter((item) => {
      const itemTag = normalizeTag(item.tag);
      const matchQ = !q || item.name.toLowerCase().includes(q) || itemTag.toLowerCase().includes(q);
      const matchTag = !tag || itemTag === tag || item.tag === tag;
      return matchQ && matchTag;
    }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  async function uploadFile(store, app, file) {
    const groups = materialTagGroups();
    const data = await window.PlannerDialog.form({
      title: "上传资料",
      submitLabel: "确认上传",
      fields: [
        {
          name: "tag",
          label: "分类标签",
          type: "select",
          value: "行测-资料分析",
          options: groups
        },
        { name: "name", label: "显示名称（选填）", placeholder: file.name, value: file.name }
      ]
    });
    if (!data) return;
    const safeTag = allMaterialTags().includes(data.tag) ? data.tag : "其他";
    const displayName = data.name || file.name;
    const id = store.uuid();
    const ext = file.name.split(".").pop() || "bin";
    const storagePath = `${id}.${ext}`;

    if (store.cloudReady) {
      const bucket = window.PM_SUPABASE?.storageBucket || "materials";
      const path = `${store.user.id}/${storagePath}`;
      const { error } = await store.supabase.storage.from(bucket).upload(path, file, { upsert: true });
      if (error) throw error;
      await store.add("materials", {
        name: displayName,
        storage_path: path,
        tag: safeTag,
        file_size: file.size,
        mime_type: file.type,
        local_only: false
      });
    } else {
      await store.saveLocalFile(id, file);
      await store.add("materials", {
        name: displayName,
        storage_path: id,
        tag: safeTag,
        file_size: file.size,
        mime_type: file.type,
        local_only: true
      });
    }
    app.toast("资料上传成功");
  }

  async function getFileBlob(store, item) {
    if (item.local_only) return store.getLocalFile(item.storage_path);
    const bucket = window.PM_SUPABASE?.storageBucket || "materials";
    const { data, error } = await store.supabase.storage.from(bucket).download(item.storage_path);
    if (error) throw error;
    return data;
  }

  async function previewMaterial(store, item) {
    const blob = await getFileBlob(store, item);
    const url = URL.createObjectURL(blob);
    if (item.mime_type === "application/pdf" || item.name.toLowerCase().endsWith(".pdf")) {
      $("#pdfPreviewTitle").textContent = item.name;
      $("#pdfPreviewFrame").src = url;
      $("#pdfPreviewDialog").showModal();
    } else {
      window.open(url, "_blank");
    }
  }

  async function downloadMaterial(store, item) {
    const blob = await getFileBlob(store, item);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = item.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function deleteMaterial(store, app, item) {
    const ok = await window.PlannerDialog.confirm(`确定删除「${item.name}」吗？`, "删除资料");
    if (!ok) return;
    if (item.local_only) await store.deleteLocalFile(item.storage_path);
    else {
      const bucket = window.PM_SUPABASE?.storageBucket || "materials";
      await store.supabase.storage.from(bucket).remove([item.storage_path]);
    }
    await store.remove("materials", item.id);
    app.toast("已删除");
    render(store, app);
  }

  function render(store, app) {
    renderTagFilterOptions();
    const items = filteredMaterials(store);
    const grid = $("#materialGrid");
    const empty = $("#materialEmpty");
    if (!grid) return;
    grid.innerHTML = items.map((item) => {
      const tag = normalizeTag(item.tag);
      return `<article class="material-item">
        <div>
          <strong>${escapeHtml(item.name)}</strong>
          <span class="tag-pill ${tagPillClass(tag)}">${escapeHtml(tag)}</span>
        </div>
        <div class="muted">${formatSize(item.file_size)} · ${new Date(item.created_at).toLocaleString("zh-CN")}</div>
        <div class="material-actions">
          <button class="ghost-btn sm-btn" data-action="preview" data-id="${item.id}">预览</button>
          <button class="ghost-btn sm-btn" data-action="download" data-id="${item.id}">下载</button>
          <button class="ghost-btn sm-btn danger-text" data-action="delete" data-id="${item.id}">删除</button>
        </div>
      </article>`;
    }).join("");
    empty?.classList.toggle("hidden", items.length > 0);
    grid.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const item = store.getById("materials", btn.dataset.id);
        if (!item) return;
        try {
          if (btn.dataset.action === "preview") await previewMaterial(store, item);
          if (btn.dataset.action === "download") await downloadMaterial(store, item);
          if (btn.dataset.action === "delete") await deleteMaterial(store, app, item);
        } catch (err) {
          app.toast(err.message || "操作失败");
        }
      });
    });
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/`/g, "&#96;");
  }

  window.PlannerMaterials = {
    init(store, app) {
      $("#uploadMaterialBtn")?.addEventListener("click", () => $("#materialFileInput")?.click());
      $("#materialFileInput")?.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        try {
          await uploadFile(store, app, file);
          render(store, app);
        } catch (err) {
          app.toast(err.message || "上传失败");
        }
      });
      $("#materialSearch")?.addEventListener("input", () => render(store, app));
      $("#materialTagFilter")?.addEventListener("change", () => render(store, app));
      $("#closePdfPreview")?.addEventListener("click", () => {
        $("#pdfPreviewFrame").src = "about:blank";
        $("#pdfPreviewDialog").close();
      });
      store.onChange(() => render(store, app));
      render(store, app);
    },
    render
  };
})();
