(function () {
  const LAST_EMAIL_KEY = "planner.lastEmail";
  const VIEW_TITLES = {
    dashboard: "今日计划",
    review: "复盘概览",
    projects: "实习项目",
    exam: "考公备考",
    essay: "申论积累",
    materials: "资料库"
  };

  const store = window.PlannerStore;
  let supabaseClient = null;

  const app = {
    toast(msg) {
      const status = document.getElementById("cloudStatus");
      if (status) {
        const prev = status.textContent;
        status.textContent = msg;
        window.setTimeout(() => { status.textContent = prev; }, 2500);
      }
    },
    navigate(view) {
      document.querySelectorAll(".nav-tab").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.view === view);
      });
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      document.getElementById(`${view}View`)?.classList.add("active");
      document.getElementById("pageTitle").textContent = VIEW_TITLES[view] || view;
      if (view === "essay") window.PlannerEssay?.renderAll?.(store, true);
    }
  };

  function initSupabase() {
    const config = window.PM_SUPABASE || {};
    if (!config.url || !config.anonKey || !window.supabase?.createClient) {
      updateCloudUI("未配置 Supabase，当前使用本地存储。");
      return null;
    }
    return window.supabase.createClient(config.url, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  }

  function cloudStatusMessage(message) {
    if (message) return message;
    if (!store.user) return "未登录时仍可本地使用。";
    if (!store.user.email_confirmed_at) {
      return "邮箱未验证，暂时无法同步。请查收验证邮件或关闭 Supabase 邮箱验证。";
    }
    return "数据会同步到 Supabase";
  }

  function updateCloudUI(message) {
    const loggedIn = !!store.user;
    document.getElementById("cloudTitle").textContent = loggedIn ? "已登录云端" : "登录后同步数据";
    document.getElementById("cloudStatus").textContent = cloudStatusMessage(message);
    document.getElementById("authForm")?.classList.toggle("hidden", loggedIn);
    document.getElementById("cloudActions")?.classList.toggle("hidden", !loggedIn);
    document.getElementById("storageMode").textContent = loggedIn ? "云端 + 本地" : "本地存储";
    if (loggedIn && store.user?.email) {
      document.getElementById("avatarInitial").textContent = store.user.email[0].toUpperCase();
    }
  }

  async function restoreSession() {
    if (!supabaseClient) return;
    try {
      const { data } = await supabaseClient.auth.getSession();
      if (data.session?.user) {
        store.initSupabase(supabaseClient, data.session.user);
        await store.syncWithCloud();
        updateCloudUI("已恢复登录，数据已从云端加载。");
      }
    } catch (err) {
      console.warn(err);
      updateCloudUI("云端连接失败，继续使用本地数据。");
    }
  }

  function bindAuth() {
    const emailInput = document.getElementById("authEmail");
    emailInput.value = localStorage.getItem(LAST_EMAIL_KEY) || "";

    document.getElementById("authForm")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!supabaseClient) {
        app.toast("请先配置 supabase-config.js");
        return;
      }
      const email = emailInput.value.trim();
      const password = document.getElementById("authPassword").value;
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) { app.toast(error.message); return; }
      localStorage.setItem(LAST_EMAIL_KEY, email);
      store.initSupabase(supabaseClient, data.user);
      await store.syncWithCloud();
      updateCloudUI("登录成功，数据已同步");
      rerenderAll();
    });

    document.getElementById("signUpBtn")?.addEventListener("click", async () => {
      if (!supabaseClient) { app.toast("请先配置 supabase-config.js"); return; }
      const email = emailInput.value.trim();
      const password = document.getElementById("authPassword").value;
      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) { app.toast(error.message); return; }
      localStorage.setItem(LAST_EMAIL_KEY, email);
      if (data.user) {
        store.initSupabase(supabaseClient, data.user);
        updateCloudUI("注册成功，请查收验证邮件（如已开启）");
      }
    });

    document.getElementById("signOutBtn")?.addEventListener("click", async () => {
      if (supabaseClient) await supabaseClient.auth.signOut();
      store.clearSupabase();
      updateCloudUI("已退出，本地数据仍保留。");
    });

    document.getElementById("syncCloudData")?.addEventListener("click", async () => {
      const btn = document.getElementById("syncCloudData");
      if (!store.cloudReady) {
        app.toast("请先登录");
        return;
      }
      btn.disabled = true;
      btn.textContent = "同步中…";
      try {
        await store.pushToCloud();
        await store.loadFromCloud();
        updateCloudUI("同步成功，本地与云端已对齐");
        app.toast("本地数据已上传并同步");
        rerenderAll();
      } catch (err) {
        const msg = err.message || "同步失败";
        updateCloudUI(msg);
        app.toast(msg);
        console.error("sync failed", err);
      } finally {
        btn.disabled = false;
        btn.textContent = "同步云端";
      }
    });

    document.getElementById("exportLocalData")?.addEventListener("click", () => {
      const blob = new Blob([store.exportBackup()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    });

    document.getElementById("importLocalData")?.addEventListener("click", () => {
      document.getElementById("importDataFile")?.click();
    });

    document.getElementById("importDataFile")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        const text = await file.text();
        store.importBackup(text);
        app.toast("备份已导入");
        rerenderAll();
      } catch (err) {
        app.toast("导入失败：" + err.message);
      }
    });

    if (supabaseClient) {
      supabaseClient.auth.onAuthStateChange((_event, session) => {
        if (session?.user) {
          store.initSupabase(supabaseClient, session.user);
          updateCloudUI("登录状态已更新");
        } else if (_event === "SIGNED_OUT") {
          store.clearSupabase();
          updateCloudUI("未登录，当前使用本地缓存。");
        }
      });
    }
  }

  function bindNavigation() {
    document.querySelectorAll(".nav-tab").forEach((tab) => {
      tab.addEventListener("click", () => app.navigate(tab.dataset.view));
    });
  }

  function bindSettings() {
    const settings = store.getSettings();
    const morning = document.getElementById("morningReminder");
    const evening = document.getElementById("eveningReminder");
    if (morning) morning.value = settings.morning_reminder || "09:30";
    if (evening) evening.value = settings.evening_reminder || "22:00";

    const saveReminder = async () => {
      await store.updateSettings({
        morning_reminder: morning?.value || "09:30",
        evening_reminder: evening?.value || "22:00"
      });
    };
    morning?.addEventListener("change", saveReminder);
    evening?.addEventListener("change", saveReminder);

    document.getElementById("enableNotifications")?.addEventListener("click", async () => {
      const result = await window.PlannerNotifications.requestPermission();
      document.getElementById("notificationStatus").textContent = window.PlannerNotifications.statusText();
      if (result === "granted") app.toast("提醒已开启");
      else if (result === "denied") app.toast("请在浏览器设置中允许通知");
    });

    document.getElementById("notificationStatus").textContent = window.PlannerNotifications.statusText();
  }

  function rerenderAll() {
    window.PlannerDashboard?.renderAll?.(store);
    window.PlannerEssay?.renderAll?.(store);
    window.PlannerMaterials?.render?.(store, app);
    window.PlannerProjects?.renderWeeklyGoals?.(store);
  }

  window.PlannerApp = app;

  function init() {
    document.getElementById("todayPill").textContent = new Intl.DateTimeFormat("zh-CN", {
      month: "long", day: "numeric", weekday: "long"
    }).format(new Date());

    supabaseClient = initSupabase();
    bindNavigation();
    bindAuth();
    bindSettings();

    window.PlannerDashboard.init(store, app);
    window.PlannerProjects.init(store);
    window.PlannerExam.init(store);
    window.PlannerEssay.init(store);
    window.PlannerMaterials.init(store, app);

    window.PlannerNotifications.startScheduler(
      () => store.getSettings(),
      () => {
        app.navigate("dashboard");
        document.getElementById("morningPlanCard")?.scrollIntoView({ behavior: "smooth" });
      },
      () => {
        app.navigate("review");
        document.getElementById("eveningSummaryCard")?.scrollIntoView({ behavior: "smooth" });
      }
    );

    restoreSession();

    const params = new URLSearchParams(location.search);
    if (params.get("reminder") === "morning") app.navigate("dashboard");
    if (params.get("reminder") === "evening") app.navigate("dashboard");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
