export default {
  async fetch(request, env, ctx) {
    // ✅ CORS 支持
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

      if (!uid) throw new Error("Missing uid");
      if (!version) throw new Error("Missing version");

      // ✅ 版本 → 下载链接映射表（可自行替换）
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

      const longURL = versionMap[version];
      if (!longURL) throw new Error(`无效的版本号: ${version}`);

      // ✅ 生成短链接逻辑（示例用随机字符串代替）
      const shortCode = Math.random().toString(36).substring(2, 8);
      const shortURL = `https://shortenworld.com/${shortCode}`;

      const title = `下载版本 ${version} (${uid})`;

      return new Response(JSON.stringify({ shortURL, title }), {
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
