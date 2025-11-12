export default {
  async fetch(request, env, ctx) {
    // === 支持 CORS ===
    if (request.method === "OPTIONS") {
      return new Response("", { headers: corsHeaders() });
    }
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: corsHeaders(),
      });
    }

    try {
      const { uid, version } = await request.json();
      if (!uid || !version)
        throw new Error("缺少参数（uid 或 version）");

      // === 版本号映射 ===
      const DOWNLOAD_MAP = {
        1: "https://example.com/app_v1.apk",
        2: "https://example.com/app_v2.apk",
        3: "https://example.com/app_v3.apk",
        4: "https://example.com/app_v4.apk",
        5: "https://example.com/app_v5.apk",
        6: "https://example.com/app_v6.apk",
        7: "https://example.com/app_v7.apk",
        8: "https://example.com/app_v8.apk",
        9: "https://example.com/app_v9.apk",
        10: "https://example.com/app_v10.apk"
      };

      const longURL = DOWNLOAD_MAP[version];
      if (!longURL) throw new Error("未知版本号");

      // === 智能标题（带日期 + UID）===
      const now = new Date(Date.now() + 8 * 60 * 60 * 1000); // 马来西亚时间
      const dateStr = now.toISOString().slice(0, 10);
      const title = `下载版本 ${version}（${uid} · ${dateStr}）`;

      // === 调用 Short.io API 生成短链接 ===
      const SHORTIO_DOMAIN = "appwt.short.gy";
      const SHORTIO_SECRET_KEY = env.SHORTIO_SECRET_KEY || "sk_XivcX9OAHYNBX5oq";

      const id = `v${version}-${Math.floor(Math.random() * 9999)}`;

      const shortRes = await fetch("https://api.short.io/links", {
        method: "POST",
        headers: {
          Authorization: SHORTIO_SECRET_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          domain: SHORTIO_DOMAIN,
          originalURL: longURL,
          path: id,
          title,
        }),
      });

      const shortData = await shortRes.json();
      if (!shortRes.ok || !shortData.shortURL)
        throw new Error(shortData.error || "短链接生成失败");

      return new Response(JSON.stringify({
        shortURL: shortData.shortURL,
        title
      }), { status: 200, headers: corsHeaders() });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: corsHeaders(),
      });
    }
  }
};

// === 🌐 CORS 支持 ===
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json",
  };
}
