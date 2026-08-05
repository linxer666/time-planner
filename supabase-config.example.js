// 复制此文件为 supabase-config.js 并填入你的项目信息
// Supabase Dashboard → Settings → API

window.PM_SUPABASE = {
  // 直连地址（海外网络 / 未被封锁时使用）
  url: "https://xxxxxxxx.supabase.co",
  // 国内网络若登录报 Failed to fetch，部署 workers/supabase-proxy.js 后填 proxyUrl：
  // proxyUrl: "https://time-planner-supabase.你的CF用户名.workers.dev",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  storageBucket: "materials"
};
