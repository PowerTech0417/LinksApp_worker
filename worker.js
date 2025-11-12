export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response("", { headers: cors() });
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: cors(),
      });
    }

    try {
      const { longURL } = await request.json();

      if (!longURL || !/^https?:\/\//i.test(longURL)) {
        return new Response(JSON.stringify({ error: "Invalid URL" }), {
          status: 400,
          headers: cors(),
        });
      }

      // === ⚙️ 配置 ===
      const SHORTIO_DOMAIN = "appwt.short.gy";
      const SHORTIO_SECRET_KEY = env.SHORTIO_SECRET_KEY || "sk_XivcX9OAHYNBX5oq";
      const SHORTIO_API = "https://api.short.io/links";

      let attempt = 0;
      let finalData = null;
      let lastError = null;

      // === 🔁 最多尝试 5 次生成短链 ===
      while (attempt < 5 && !finalData) {
        attempt++;

        try {
          // === 先检查是否已有相同原始链接 ===
          const checkURL = `${SHORTIO_API}?originalURL=${encodeURIComponent(longURL)}&domain=${SHORTIO_DOMAIN}`;
          const checkRes = await fetch(checkURL, {
            headers: {
              accept: "application/json",
              authorization: SHORTIO_SECRET_KEY,
            },
          });

          const checkData = await checkRes.json();

          if (checkData?.links?.length) {
            // 如果已经存在，换一个随机 path 创建新短链
            console.log(`⚠️ Attempt ${attempt}: Link exists, trying new short code...`);
          }

          // === 随机生成 5 位数短码 ===
          let shortCode;
          let isUnique = false;

          for (let i = 0; i < 10; i++) {
            const candidate = Math.floor(10000 + Math.random() * 80000).toString();

            const existsRes = await fetch(
              `${SHORTIO_API}?path=${candidate}&domain=${SHORTIO_DOMAIN}`,
              {
                headers: {
                  accept: "application/json",
                  authorization: SHORTIO_SECRET_KEY,
                },
              }
            );

            const existsData = await existsRes.json();

            if (!existsData?.links?.length) {
              shortCode = candidate;
              isUnique = true;
              break;
            }
          }

          if (!isUnique) {
            throw new Error("No available short code found after 10 checks");
          }

          // === 创建短链 ===
          const createRes = await fetch(SHORTIO_API, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: SHORTIO_SECRET_KEY,
            },
            body: JSON.stringify({
              domain: SHORTIO_DOMAIN,
              originalURL: longURL,
              path: shortCode,
            }),
          });

          const createData = await createRes.json();

          if (createData.shortURL) {
            finalData = {
              shortURL: createData.shortURL,
              code: shortCode,
              reused: checkData?.links?.length > 0,
              attempt,
            };
          } else {
            lastError = createData.error || "Failed to create short link";
          }
        } catch (err) {
          lastError = err.message;
        }
      }

      if (!finalData) {
        return new Response(
          JSON.stringify({
            error: "Failed to create unique short link after 5 attempts",
            details: lastError,
          }),
          { status: 500, headers: cors() }
        );
      }

      return new Response(JSON.stringify(finalData), { headers: cors() });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Unexpected Error", details: err.message }),
        { status: 500, headers: cors() }
      );
    }
  },
};

// === 🌐 CORS 支持 ===
function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}
