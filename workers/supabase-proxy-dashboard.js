/**
 * 给 Cloudflare 控制台「手动创建 Worker」用的版本（不用 wrangler login）。
 * Dashboard → Workers → Create → Edit code → 全选粘贴本文件 → Deploy
 */

const SUPABASE_URL = "https://hxgdjzpjcmzgsojhhoio.supabase.co";

const ALLOW_HEADERS = [
  "authorization",
  "apikey",
  "content-type",
  "x-client-info",
  "x-supabase-api-version",
  "prefer",
  "range",
];

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD",
    "Access-Control-Allow-Headers": ALLOW_HEADERS.join(", "),
    "Access-Control-Max-Age": "86400",
  };
}

function withCors(response, origin) {
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders(origin)).forEach(([k, v]) => headers.set(k, v));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const base = SUPABASE_URL.replace(/\/$/, "");
    const incoming = new URL(request.url);
    const target = new URL(incoming.pathname + incoming.search, base);

    const headers = new Headers();
    for (const [key, value] of request.headers.entries()) {
      const lower = key.toLowerCase();
      if (lower === "host" || lower === "cf-connecting-ip") continue;
      headers.set(key, value);
    }
    headers.set("Host", new URL(base).host);

    const init = {
      method: request.method,
      headers,
      redirect: "manual",
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
    }

    try {
      const upstream = await fetch(target.toString(), init);
      return withCors(upstream, origin);
    } catch (err) {
      return new Response(`Proxy error: ${err.message}`, {
        status: 502,
        headers: corsHeaders(origin),
      });
    }
  },
};
