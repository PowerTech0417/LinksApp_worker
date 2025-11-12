export default {
  async fetch(request, env, ctx) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response("", { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
        status: 405,
        headers: corsHeaders()
      });
    }

    try {
      // 解析 body（容错）
      let body = {};
      try {
        body = await request.json();
      } catch (e) {
        throw new Error("Invalid JSON body");
      }

      const { uid, version, longURL: providedLongURL } = body;

      if (!uid) throw new Error("Missing uid");

      // === 版本 -> 下载链接映射（请替换为你的真实下载地址） ===
      const DOWNLOAD_MAP = {
        "1": "https://example.com/downloads/app_v1.apk",
        "2": "https://example.com/downloads/app_v2.apk",
        "3": "https://example.com/downloads/app_v3.apk",
        "4": "https://example.com/downloads/app_v4.apk",
        "5": "https://example.com/downloads/app_v5.apk",
        "6": "https://example.com/downloads/app_v6.apk",
        "7": "https://example.com/downloads/app_v7.apk",
        "8": "https://example.com/downloads/app_v8.apk",
        "9": "https://example.com/downloads/app_v9.apk",
        "10": "https://example.com/downloads/app_v10.apk"
      };

      // 先看有没有提供 longURL（向后兼容）
      let longURL = providedLongURL;

      // 若没有提供，则用 version 去映射
      if (!longURL) {
        if (!version) throw new Error("Missing version and no longURL provided");
        longURL = DOWNLOAD_MAP[String(version)];
        if (!longURL) throw new Error(`No download link mapped for version: ${version}`);
      }

      // === 智能标题 ===
      const malaysiaNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
      const dateMY = malaysiaNow.toISOString().slice(0, 10);
      const title = `📦 下载版本 ${version || "auto"} (${uid} · ${dateMY})`;

      // === 生成短链 ===
      // 如果你想使用 Short.io（真实 API），把 useShortIo = true，
      // 并在 Worker 环境变量 SHORTIO_SECRET_KEY 中设置 key。
      const useShortIo = true;
      if (useShortIo) {
        const SHORTIO_DOMAIN = "appwt.short.gy"; // 修改为你的短域名
        const SHORTIO_SECRET_KEY = env.SHORTIO_SECRET_KEY || "sk_XivcX9OAHYNBX5oq";

        // 生成唯一 path（可再改成更友好的规则）
        const path = "v" + (version || "auto") + "_" + Math.floor(10000 + Math.random() * 90000);

        const shortRes = await fetch("https://api.short.io/links", {
          method: "POST",
          headers: {
            Authorization: SHORTIO_SECRET_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            domain: SHORTIO_DOMAIN,
            originalURL: longURL,
            path,
            title
          })
        });

        const shortData = await shortRes.json();
        if (!shortRes.ok) {
          // 返回 Short.io 的错误信息，便于排查
          throw new Error(shortData.error || JSON.stringify(shortData));
        }

        return new Response(
          JSON.stringify({
            success: true,
            shortURL: shortData.shortURL,
            title,
            longURL
          }),
          { status: 200, headers: corsHeaders() }
        );
      } else {
        // 用简易模拟短链（仅测试用）
        const code = Math.random().toString(36).slice(2, 8);
        const shortURL = `https://shorten.example/${code}`;
        return new Response(
          JSON.stringify({ success: true, shortURL, title, longURL }),
          { status: 200, headers: corsHeaders() }
        );
      }
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: corsHeaders()
      });
    }
  }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
    "Content-Type": "application/json"
  };
}
