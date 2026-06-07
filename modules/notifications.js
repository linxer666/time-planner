(function () {
  const LAST_MORNING_KEY = "planner.lastMorningNotify";
  const LAST_EVENING_KEY = "planner.lastEveningNotify";

  function parseTime(value) {
    const [h, m] = (value || "09:30").split(":").map(Number);
    return { h: h || 0, m: m || 0 };
  }

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  function isDueNow(timeValue) {
    const now = new Date();
    const { h, m } = parseTime(timeValue);
    return now.getHours() === h && now.getMinutes() === m;
  }

  function showNotification(title, body, onClick) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const n = new Notification(title, {
      body,
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>计</text></svg>"
    });
    n.onclick = () => {
      window.focus();
      if (onClick) onClick();
      n.close();
    };
  }

  window.PlannerNotifications = {
    async requestPermission() {
      if (!("Notification" in window)) return "unsupported";
      if (Notification.permission === "granted") return "granted";
      if (Notification.permission === "denied") return "denied";
      return Notification.permission === "default" ? Notification.requestPermission() : Notification.permission;
    },

    startScheduler(getSettings, onMorning, onEvening) {
      const tick = () => {
        const settings = getSettings();
        const day = todayKey();
        if (isDueNow(settings.morning_reminder)) {
          if (localStorage.getItem(LAST_MORNING_KEY) !== day) {
            localStorage.setItem(LAST_MORNING_KEY, day);
            showNotification("今日计划", "花 2 分钟写下今天的实习和考公目标。", onMorning);
          }
        }
        if (isDueNow(settings.evening_reminder)) {
          if (localStorage.getItem(LAST_EVENING_KEY) !== day) {
            localStorage.setItem(LAST_EVENING_KEY, day);
            showNotification("今日总结", "勾选完成情况，记录今天的刷题数据。", onEvening);
          }
        }
      };
      tick();
      window.setInterval(tick, 30000);
    },

    statusText() {
      if (!("Notification" in window)) return "当前浏览器不支持提醒";
      if (Notification.permission === "granted") return "提醒已开启";
      if (Notification.permission === "denied") return "提醒被拒绝，请在浏览器设置中允许";
      return "点击上方按钮开启浏览器提醒";
    }
  };
})();
