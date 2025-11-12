export default {
  async fetch(request, env, ctx) {
    // === ✅ 允许 CORS ===
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
      if (!uid || !version) throw new Error("缺少参数：uid 或 version");

      // === 🧩 Short.io 设置 ===
      const SHORTIO_DOMAIN = "appwt.short.gy";
      const SHORTIO_SECRET_KEY = env.SHORTIO_SECRET_KEY || "sk_XivcX9OAHYNBX5oq";

      // === 📦 10 个版本的下载链接（改成你自己的下载地址） ===
      const DOWNLOAD_LINKS = {
        1: "https://example.com/downloads/app_v1.apk",
        2: "https://example.com/downloads/app_v2.apk",
        3: "https://example.com/downloads/app_v3.apk",
        4: "https://example.com/downloads/app_v4.apk",
        5: "https://example.com/downloads/app_v5.apk",
        6: "https://example.com/downloads/app_v6.apk",
        7: "https://example.com/downloads/app_v7.apk",
        8: "https://example.com/downloads/app_v8.apk",
        9: "https://example.com/downloads/app_v9.apk",
        10: "https://example.com/downloads/app_v10.apk",
      };

      const longURL = DOWNLOAD_LINKS[version];
      if (!longURL) throw new Error(`版本 ${version} 暂无可用下载链接`);

      // === 🧠 智能标题生成 ===
      const malaysiaNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
      const dateMY = malaysiaNow.toISOString().slice(0, 10);
      const title = `📦 下载版本 ${version} (${uid} · ${dateMY})`;

      // === 🔢 唯一路径 ID ===
      const path = "v" + version + "_" + Math.floor(10000 + Math.random() * 90000);

      // === 🚀 调用 Short.io API ===
      const res = await fetch("https://api.short.io/links", {
        method: "POST",
        headers: {
          Authorization: SHORTIO_SECRET_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          domain: SHORTIO_DOMAIN,
          originalURL: longURL,
          path,
          title,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Short.io API 错误");

      // === ✅ 返回 JSON 给页面 ===
      return new Response(
        JSON.stringify({
          success: true,
          shortURL: data.shortURL,
          title,
        }),
        { status: 200, headers: corsHeaders() }
      );
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: corsHeaders(),
      });
    }
  },
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
