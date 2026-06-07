(function () {
  const dialog = document.getElementById("genericDialog");
  const titleEl = document.getElementById("genericDialogTitle");
  const bodyEl = document.getElementById("genericDialogBody");
  let resolver = null;

  function closeDialog(result) {
    dialog?.close();
    if (resolver) {
      const fn = resolver;
      resolver = null;
      fn(result);
    }
  }

  document.getElementById("closeGenericDialog")?.addEventListener("click", () => closeDialog(null));
  dialog?.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeDialog(null);
  });

  function renderField(field) {
    const id = `dlg-${field.name}`;
    if (field.type === "select") {
      const options = (field.options || []).map((opt) => {
        if (opt && typeof opt === "object" && opt.group && Array.isArray(opt.options)) {
          const inner = opt.options.map((child) => {
            const value = typeof child === "string" ? child : child.value;
            const label = typeof child === "string" ? child : child.label;
            const selected = value === field.value ? "selected" : "";
            return `<option value="${escapeAttr(value)}" ${selected}>${escapeHtml(label)}</option>`;
          }).join("");
          return `<optgroup label="${escapeAttr(opt.group)}">${inner}</optgroup>`;
        }
        const value = typeof opt === "string" ? opt : opt.value;
        const label = typeof opt === "string" ? opt : opt.label;
        const selected = value === field.value ? "selected" : "";
        return `<option value="${escapeAttr(value)}" ${selected}>${escapeHtml(label)}</option>`;
      }).join("");
      return `<label for="${id}">${escapeHtml(field.label)}<select id="${id}" name="${field.name}" ${field.required ? "required" : ""}>${options}</select></label>`;
    }
    if (field.type === "textarea") {
      return `<label for="${id}">${escapeHtml(field.label)}<textarea id="${id}" name="${field.name}" rows="${field.rows || 3}" placeholder="${escapeAttr(field.placeholder || "")}" ${field.required ? "required" : ""}>${escapeHtml(field.value || "")}</textarea></label>`;
    }
    const inputType = field.type || "text";
    return `<label for="${id}">${escapeHtml(field.label)}<input id="${id}" name="${field.name}" type="${inputType}" value="${escapeAttr(field.value || "")}" placeholder="${escapeAttr(field.placeholder || "")}" ${field.required ? "required" : ""} ${field.min != null ? `min="${field.min}"` : ""} ${field.max != null ? `max="${field.max}"` : ""} /></label>`;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/`/g, "&#96;");
  }

  window.PlannerDialog = {
    form({ title, fields = [], submitLabel = "确定", cancelLabel = "取消" }) {
      return new Promise((resolve) => {
        if (!dialog || !bodyEl || !titleEl) {
          resolve(null);
          return;
        }
        resolver = resolve;
        titleEl.textContent = title;
        bodyEl.innerHTML = `
          <form class="quick-form dialog-form" id="genericDialogForm">
            ${fields.map(renderField).join("")}
            <div class="form-actions">
              <button class="primary-btn" type="submit">${escapeHtml(submitLabel)}</button>
              <button class="ghost-btn" type="button" id="genericDialogCancel">${escapeHtml(cancelLabel)}</button>
            </div>
          </form>
        `;
        const form = document.getElementById("genericDialogForm");
        document.getElementById("genericDialogCancel")?.addEventListener("click", () => closeDialog(null));
        form?.addEventListener("submit", (e) => {
          e.preventDefault();
          const data = {};
          fields.forEach((field) => {
            const el = form.elements[field.name];
            data[field.name] = el?.value?.trim?.() ?? el?.value ?? "";
          });
          closeDialog(data);
        });
        dialog.showModal();
        const first = form?.querySelector("input, select, textarea");
        first?.focus();
      });
    },

    confirm(message, title = "确认操作") {
      return new Promise((resolve) => {
        if (!dialog || !bodyEl || !titleEl) {
          resolve(false);
          return;
        }
        resolver = resolve;
        titleEl.textContent = title;
        bodyEl.innerHTML = `
          <p class="dialog-message">${escapeHtml(message)}</p>
          <div class="form-actions">
            <button class="primary-btn" type="button" id="genericDialogOk">确定</button>
            <button class="ghost-btn" type="button" id="genericDialogCancel">取消</button>
          </div>
        `;
        document.getElementById("genericDialogOk")?.addEventListener("click", () => closeDialog(true));
        document.getElementById("genericDialogCancel")?.addEventListener("click", () => closeDialog(false));
        dialog.showModal();
      });
    },

    alert(message, title = "提示") {
      return new Promise((resolve) => {
        if (!dialog || !bodyEl || !titleEl) {
          resolve();
          return;
        }
        resolver = resolve;
        titleEl.textContent = title;
        bodyEl.innerHTML = `
          <p class="dialog-message">${escapeHtml(message)}</p>
          <div class="form-actions">
            <button class="primary-btn" type="button" id="genericDialogOk">知道了</button>
          </div>
        `;
        document.getElementById("genericDialogOk")?.addEventListener("click", () => closeDialog(true));
        dialog.showModal();
      });
    }
  };
})();
