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

  function guessMimeType(file) {
    if (file.type) return file.type;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const map = {
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      txt: "text/plain"
    };
    return map[ext] || "application/octet-stream";
  }

  function uploadErrorMessage(err) {
    const msg = String(err?.message || err || "");
    if (msg.includes("mime") || msg.includes("MIME")) {
      return "文件类型不被云端接受，请上传 PDF 或 Word";
    }
    if (msg.includes("Bucket not found")) {
      return "云端资料库未初始化，请在 Supabase 执行 supabase-storage.sql";
    }
    if (msg.includes("row-level security") || msg.includes("policy")) {
      return "云端权限不足，请确认已登录且 Storage 策略已配置";
    }
    if (msg.includes("JWT") || msg.includes("session") || msg.includes("401")) {
      return "登录已过期，请退出后重新登录再上传";
    }
    if (msg.includes("Payload too large") || msg.includes("maximum")) {
      return "文件超过 50MB 上限";
    }
    return msg || "上传失败";
  }

  async function saveMaterialLocal(store, file, meta) {
    await store.saveLocalFile(meta.id, file);
    await store.add("materials", {
      name: meta.displayName,
      storage_path: meta.id,
      tag: meta.safeTag,
      file_size: file.size,
      mime_type: meta.mimeType,
      local_only: true
    });
  }

  async function saveMaterialCloud(store, file, meta) {
    const bucket = window.PM_SUPABASE?.storageBucket || "materials";
    const path = `${store.user.id}/${meta.storagePath}`;
    const { error } = await store.supabase.storage.from(bucket).upload(path, file, {
      upsert: true,
      contentType: meta.mimeType
    });
    if (error) throw error;
    await store.add("materials", {
      name: meta.displayName,
      storage_path: path,
      tag: meta.safeTag,
      file_size: file.size,
      mime_type: meta.mimeType,
      local_only: false
    });
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
    const mimeType = guessMimeType(file);
    const meta = { id, storagePath, displayName, safeTag, mimeType };

    if (store.cloudReady) {
      try {
        await saveMaterialCloud(store, file, meta);
        app.toast("资料已上传到云端");
        return;
      } catch (err) {
        console.warn("云端上传失败，改存本机", err);
        await saveMaterialLocal(store, file, meta);
        app.toast(`云端失败，已暂存本机：${uploadErrorMessage(err)}`);
        return;
      }
    }

    await saveMaterialLocal(store, file, meta);
    app.toast("资料已保存到本浏览器（登录后可同步到云端）");
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
          console.error(err);
          app.toast(uploadErrorMessage(err));
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
