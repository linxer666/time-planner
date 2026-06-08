(function () {
  const LOCAL_KEY = "planner.data";
  const FILE_DB = "planner-files";
  const FILE_STORE = "blobs";
  const TABLES = [
    "projects", "milestones", "tasks", "weekly_goals", "tech_todos", "work_logs",
    "exam_events", "study_records", "courses", "course_logs", "daily_plans",
    "daily_tasks", "daily_summaries", "wrong_questions", "materials",
    "essay_user_actions", "settings"
  ];

  const SETTINGS_KEYS = [
    "morning_reminder", "evening_reminder",
    "guokao_exam_date", "guangdong_exam_date", "xuandiao_exam_date",
    "dashboard_view"
  ];

  const emptyData = () => ({
    projects: [],
    milestones: [],
    tasks: [],
    weekly_goals: [],
    tech_todos: [],
    work_logs: [],
    exam_events: [],
    study_records: [],
    courses: [],
    course_logs: [],
    daily_plans: [],
    daily_tasks: [],
    daily_summaries: [],
    wrong_questions: [],
    essay_user_actions: [],
    materials: [],
    settings: {
      morning_reminder: "09:30",
      evening_reminder: "22:00",
      guokao_exam_date: "",
      guangdong_exam_date: "",
      xuandiao_exam_date: "",
      dashboard_view: "tasks"
    }
  });

  class DataStore {
    constructor() {
      this.data = this.loadLocal();
      this.supabase = null;
      this.user = null;
      this.cloudReady = false;
      this.listeners = new Set();
      this.fileDbPromise = null;
    }

    onChange(fn) {
      this.listeners.add(fn);
      return () => this.listeners.delete(fn);
    }

    emit() {
      this.listeners.forEach((fn) => fn(this.data));
    }

    loadLocal() {
      try {
        const raw = localStorage.getItem(LOCAL_KEY);
        if (!raw) return emptyData();
        const parsed = JSON.parse(raw);
        return { ...emptyData(), ...parsed, settings: { ...emptyData().settings, ...(parsed.settings || {}) } };
      } catch {
        return emptyData();
      }
    }

    saveLocal() {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(this.data));
      this.emit();
    }

    initSupabase(client, user) {
      this.supabase = client;
      this.user = user;
      this.cloudReady = !!(client && user);
    }

    clearSupabase() {
      this.supabase = null;
      this.user = null;
      this.cloudReady = false;
    }

    uuid() {
      return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    list(table) {
      return [...(this.data[table] || [])];
    }

    getById(table, id) {
      return this.list(table).find((item) => item.id === id) || null;
    }

    async add(table, item) {
      const row = { id: this.uuid(), created_at: new Date().toISOString(), ...item };
      this.data[table] = [...this.list(table), row];
      this.saveLocal();
      await this.syncRow(table, "insert", row);
      return row;
    }

    async update(table, id, patch) {
      this.data[table] = this.list(table).map((item) => (item.id === id ? { ...item, ...patch } : item));
      this.saveLocal();
      const row = this.getById(table, id);
      if (row) await this.syncRow(table, "update", row);
      return row;
    }

    async remove(table, id) {
      this.data[table] = this.list(table).filter((item) => item.id !== id);
      this.saveLocal();
      await this.syncRow(table, "delete", { id });
    }

    async upsertByDate(table, dateField, item) {
      const existing = this.list(table).find((row) => row[dateField] === item[dateField]);
      if (existing) return this.update(table, existing.id, item);
      return this.add(table, item);
    }

    getSettings() {
      return { ...this.data.settings };
    }

    async updateSettings(patch) {
      this.data.settings = { ...this.data.settings, ...patch };
      this.saveLocal();
      await this.syncSettingsToCloud();
    }

    isEmptySetting(value) {
      return value == null || value === "";
    }

    normalizeDate(value) {
      if (this.isEmptySetting(value)) return "";
      return String(value).slice(0, 10);
    }

    normalizeCloudSettings(data) {
      if (!data) return { ...emptyData().settings };
      return {
        morning_reminder: data.morning_reminder?.slice(0, 5) || "09:30",
        evening_reminder: data.evening_reminder?.slice(0, 5) || "22:00",
        guokao_exam_date: this.normalizeDate(data.guokao_exam_date),
        guangdong_exam_date: this.normalizeDate(data.guangdong_exam_date),
        xuandiao_exam_date: this.normalizeDate(data.xuandiao_exam_date),
        dashboard_view: data.dashboard_view || "tasks",
        updated_at: data.updated_at || null
      };
    }

    mergeSettings(localSettings, cloudSettings) {
      const defaults = emptyData().settings;
      const local = { ...defaults, ...localSettings };
      const cloud = { ...defaults, ...cloudSettings };
      const merged = { ...defaults };
      SETTINGS_KEYS.forEach((key) => {
        const cloudVal = cloud[key];
        const localVal = local[key];
        if (!this.isEmptySetting(cloudVal)) merged[key] = cloudVal;
        else if (!this.isEmptySetting(localVal)) merged[key] = localVal;
        else merged[key] = defaults[key];
      });
      return merged;
    }

    rowTimestamp(row) {
      const value = row?.updated_at || row?.created_at;
      return value ? new Date(value).getTime() : 0;
    }

    normalizeCloudRow(row) {
      const copy = { ...row };
      if (copy.record_date) copy.record_date = copy.record_date.slice(0, 10);
      if (copy.plan_date) copy.plan_date = copy.plan_date.slice(0, 10);
      if (copy.summary_date) copy.summary_date = copy.summary_date.slice(0, 10);
      if (copy.log_date) copy.log_date = copy.log_date.slice(0, 10);
      if (copy.deadline) copy.deadline = copy.deadline.slice(0, 10);
      if (copy.event_date) copy.event_date = copy.event_date.slice(0, 10);
      if (copy.task_date) copy.task_date = copy.task_date.slice(0, 10);
      if (copy.deadline_date) copy.deadline_date = copy.deadline_date.slice(0, 10);
      if (copy.start_date) copy.start_date = copy.start_date?.slice(0, 10) || "";
      if (copy.end_date) copy.end_date = copy.end_date?.slice(0, 10) || "";
      if (copy.accuracy != null) copy.accuracy = Number(copy.accuracy);
      return copy;
    }

    mergeTableRows(localRows, cloudRows) {
      const byId = new Map();
      cloudRows.forEach((row) => byId.set(row.id, row));
      localRows.forEach((row) => {
        const existing = byId.get(row.id);
        if (!existing) {
          byId.set(row.id, row);
          return;
        }
        byId.set(row.id, this.rowTimestamp(row) > this.rowTimestamp(existing) ? row : existing);
      });
      return [...byId.values()].sort((a, b) => this.rowTimestamp(a) - this.rowTimestamp(b));
    }

    mergeData(localData, cloudData) {
      const merged = emptyData();
      merged.settings = this.mergeSettings(localData.settings, cloudData.settings);
      TABLES.forEach((table) => {
        if (table === "settings") return;
        merged[table] = this.mergeTableRows(localData[table] || [], cloudData[table] || []);
      });
      const localOnlyMaterials = (localData.materials || []).filter((item) => item.local_only);
      if (localOnlyMaterials.length) {
        const cloudIds = new Set(merged.materials.map((item) => item.id));
        merged.materials = [
          ...merged.materials,
          ...localOnlyMaterials.filter((item) => !cloudIds.has(item.id))
        ];
      }
      return merged;
    }

    cloneData(data) {
      return JSON.parse(JSON.stringify(data));
    }

    async syncSettingsToCloud() {
      if (!this.cloudReady) return;
      try {
        const { error } = await this.supabase
          .from("user_settings")
          .upsert(this.mapToCloud("settings", this.data.settings));
        if (error) throw error;
      } catch (err) {
        console.warn("设置同步失败", err.message);
      }
    }

    nullifyDateFields(row) {
      const dateFields = [
        "start_date", "end_date", "deadline", "deadline_date", "log_date",
        "event_date", "record_date", "task_date", "plan_date", "summary_date",
        "guokao_exam_date", "guangdong_exam_date", "xuandiao_exam_date"
      ];
      dateFields.forEach((field) => {
        if (field in row && (row[field] === "" || row[field] == null)) {
          row[field] = null;
        }
      });
      return row;
    }

    mapToCloud(table, row) {
      if (table === "settings") {
        return this.nullifyDateFields({
          user_id: this.user?.id,
          morning_reminder: row.morning_reminder,
          evening_reminder: row.evening_reminder,
          guokao_exam_date: row.guokao_exam_date,
          guangdong_exam_date: row.guangdong_exam_date,
          xuandiao_exam_date: row.xuandiao_exam_date,
          dashboard_view: row.dashboard_view || "tasks",
          updated_at: new Date().toISOString()
        });
      }
      const mapped = this.nullifyDateFields({ ...row, user_id: this.user?.id });
      delete mapped.local_only;
      if (mapped.accuracy === "") mapped.accuracy = null;
      return mapped;
    }

    async syncRow(table, action, row) {
      if (!this.cloudReady || table === "settings") return;
      try {
        if (action === "delete") {
          await this.supabase.from(table).delete().eq("id", row.id).eq("user_id", this.user.id);
        } else {
          await this.supabase.from(table).upsert(this.mapToCloud(table, row), { onConflict: "id" });
        }
      } catch (err) {
        console.warn(`云端同步失败 [${table}]`, err.message);
      }
    }

    async cloudUpsert(table, row) {
      const { error } = await this.supabase.from(table).upsert(row, { onConflict: "id" });
      if (error) throw error;
    }

    async pushToCloud(options = {}) {
      if (!this.cloudReady) throw new Error("请先登录 Supabase");
      if (!options.skipEmailCheck && !this.user?.email_confirmed_at) {
        throw new Error("邮箱未验证，无法同步。请在邮箱里点验证链接，或让管理员在 Supabase 后台确认邮箱。");
      }
      await this.syncSettingsToCloud();
      for (const table of TABLES) {
        if (table === "settings") continue;
        for (const row of this.list(table)) {
          if (table === "materials" && row.local_only) continue;
          try {
            await this.cloudUpsert(table, this.mapToCloud(table, row));
          } catch (err) {
            console.warn(`上传失败 [${table}]`, err.message);
            if (!options.silent) throw err;
          }
        }
      }
    }

    async fetchFromCloud() {
      if (!this.cloudReady) return emptyData();
      const next = emptyData();
      for (const table of TABLES) {
        if (table === "settings") {
          try {
            const { data, error } = await this.supabase
              .from("user_settings")
              .select("*")
              .eq("user_id", this.user.id)
              .maybeSingle();
            if (error) throw error;
            if (data) next.settings = this.normalizeCloudSettings(data);
          } catch (err) {
            console.warn("拉取 user_settings 失败", err.message);
          }
          continue;
        }
        try {
          const { data, error } = await this.supabase
            .from(table)
            .select("*")
            .eq("user_id", this.user.id)
            .order("created_at", { ascending: true });
          if (error) throw error;
          next[table] = (data || []).map((row) => this.normalizeCloudRow(row));
        } catch (err) {
          console.warn(`拉取 ${table} 失败`, err.message);
        }
      }
      return next;
    }

    async syncWithCloud() {
      if (!this.cloudReady) throw new Error("请先登录 Supabase");
      const localSnapshot = this.cloneData(this.data);
      const cloudData = await this.fetchFromCloud();
      this.data = this.mergeData(localSnapshot, cloudData);
      this.saveLocal();
      await this.pushToCloud({ silent: true, skipEmailCheck: true });
      return this.data;
    }

    async loadFromCloud() {
      if (!this.cloudReady) return;
      const localSnapshot = this.cloneData(this.data);
      const cloudData = await this.fetchFromCloud();
      this.data = this.mergeData(localSnapshot, cloudData);
      this.saveLocal();
    }

    exportBackup() {
      return JSON.stringify({ version: 1, exported_at: new Date().toISOString(), data: this.data }, null, 2);
    }

    importBackup(jsonText) {
      const parsed = JSON.parse(jsonText);
      this.data = { ...emptyData(), ...(parsed.data || parsed) };
      this.saveLocal();
    }

    openFileDb() {
      if (!this.fileDbPromise) {
        this.fileDbPromise = new Promise((resolve, reject) => {
          const req = indexedDB.open(FILE_DB, 1);
          req.onupgradeneeded = () => req.result.createObjectStore(FILE_STORE);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      }
      return this.fileDbPromise;
    }

    async saveLocalFile(id, blob) {
      const db = await this.openFileDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(FILE_STORE, "readwrite");
        tx.objectStore(FILE_STORE).put(blob, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    async getLocalFile(id) {
      const db = await this.openFileDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(FILE_STORE, "readonly");
        const req = tx.objectStore(FILE_STORE).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    }

    async deleteLocalFile(id) {
      const db = await this.openFileDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(FILE_STORE, "readwrite");
        tx.objectStore(FILE_STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
  }

  window.PlannerStore = new DataStore();
})();
