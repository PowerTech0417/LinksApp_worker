export default {
  async fetch(request, env, ctx) {
    // ✅ CORS 处理
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
      // === 📦 读取请求体 ===
      const body = await request.json();
      const { longURL: providedLongURL, uid, version, redirect } = body;

      if (!uid) throw new Error("Missing uid");
      if (!version && !providedLongURL) throw new Error("Missing version or longURL");

      // ✅ 自动匹配下载链接（可修改为你自己的下载地址）
      const versionMap = {
        1: "https://example.com/download/v1.apk",
        2: "https://example.com/download/v2.apk",
        3: "https://example.com/download/v3.apk",
        4: "https://example.com/download/v4.apk",
        5: "https://example.com/download/v5.apk",
        6: "https://example.com/download/v6.apk",
        7: "https://example.com/download/v7.apk",
        8: "https://example.com/download/v8.apk",
        9: "https://example.com/download/v9.apk",
        10: "https://example.com/download/v10.apk"
      };

      const longURL = providedLongURL || versionMap[version];
      if (!longURL) throw new Error(`无效的版本号或缺少 longURL: ${version}`);

      // === 🧩 Short.io 配置 ===
      const SHORTIO_DOMAIN = "appwt.short.gy"; // ✅ 你的短链接域名
      const SHORTIO_SECRET_KEY = env.SHORTIO_SECRET_KEY || "sk_XivcX9OAHYNBX5oq"; // ✅ API Key

      // === 📱 从 UA 识别设备 / APP ===
      const ua = request.headers.get("User-Agent") || "";
      const appType = detectApp(ua);

      // === 🧠 智能标题区（自动组合标题）===
      let title = "📦 OTT 下载链接";
      if (appType) title += ` · ${appType}`;
      if (version) title += ` v${version}`;

      // 🇲🇾 加入马来西亚日期
      const malaysiaNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
      const dateMY = malaysiaNow.toISOString().slice(0, 10);
      if (uid) title += ` (${uid} · ${dateMY})`;
      else title += ` (${dateMY})`;

      // === 🔁 自动生成唯一短链 ID ===
      let id, shortData;
      for (let i = 0; i < 5; i++) {
        id = "id" + Math.floor(1000 + Math.random() * 90000);

        const res = await fetch("https://api.short.io/links", {
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

        const data = await res.json();

        if (res.ok && data.shortURL) {
          shortData = data;
          break;
        }

        if (data.error && data.error.includes("already exists")) continue;
        else throw new Error(data.error || "Short.io API Error");
      }

      if (!shortData) throw new Error("无法生成短链接，请稍后重试。");

      // === 📺 redirect 模式（TV 设备跳转）===
      if (redirect === true || redirect === "1") {
        return Response.redirect(shortData.shortURL, 302);
      }

      // === 默认返回 JSON ===
      return new Response(
        JSON.stringify({
          shortURL: shortData.shortURL,
          title,
          appType,
          version,
          longURL,
          id,
          createdAt: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: corsHeaders(),
        }
      );
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
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

/** 📲 智能识别 OTT App 类型 */
function detectApp(ua) {
  const u = ua.toLowerCase();
  if (u.includes("ott player")) return "OTT Player 🟢";
  if (u.includes("ott tv")) return "OTT TV 🔵";
  if (u.includes("ott navigator")) return "OTT Navigator 🟣";
  if (u.includes("smart tv")) return "Smart TV";
  if (u.includes("android")) return "Android 📱";
  return "Unknown Device";
}
