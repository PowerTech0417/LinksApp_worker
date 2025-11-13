addEventListener("fetch", event => {
  event.respondWith(handleEventSafe(event));
});

/* === 🛡 安全封装：防止 Error 1101 === */
async function handleEventSafe(event) {
  try {
    return await handleRequest(event.request, event);
  } catch (err) {
    return new Response("⚠️ Internal Error: " + (err.message || err), { status: 500 });
  }
}

async function handleRequest(request, event) {
  const url = new URL(request.url);

  // === 📥 下载中转 ===
  if (url.pathname.startsWith("/dl/")) {
    const zoneId = url.pathname.split("/dl/")[1];
    return handleHiddenDownload(zoneId);
  }

  // === ⚙️ 配置区 ===
  const JSON_URL =
    "https://raw.githubusercontent.com/PowerTech0417/LinksApp_worker/refs/heads/main/downloads.json";
  const DEVICE_CONFLICT_URL = "https://life4u22.blogspot.com/p/not-found.html";
  const SIGN_SECRET = "mySuperSecretKey";
  const MAX_DEVICES = 3;

  const params = url.searchParams;
  const uid = params.get("uid");
  const zone = parseInt(params.get("zone") || "0");
  const sig = params.get("sig");

  if (!uid || !sig || zone < 1) {
    return new Response("🚫 Invalid Link: Missing or invalid parameters", { status: 403 });
  }

  // === 1️⃣ 验证签名 ===
  const expectedSig = await sign(`${uid}:${zone}`, SIGN_SECRET);
  if (!timingSafeCompare(expectedSig, sig)) {
    return new Response("🚫 Invalid Signature", { status: 403 });
  }

  // === 2️⃣ 平台识别 + 生成稳定设备指纹 ===
  const platformCheck = detectPlatform(request.headers.get("User-Agent") || "");
  if (!platformCheck.allowed) {
    // ❌ 非允许平台 → 封锁页
    return Response.redirect(DEVICE_CONFLICT_URL, 302);
  }
  const deviceFingerprint = await getDeviceFingerprint(request, uid, SIGN_SECRET, platformCheck.platform);

  // === 3️⃣ 检查 KV 存储 ===
  const kv = event.env?.UID_BINDINGS || globalThis.UID_BINDINGS;
  if (!kv) {
    return new Response("🚨 UID_BINDINGS KV not found. Please bind it in Cloudflare Worker settings.", {
      status: 503,
    });
  }

  const key = `uid:${uid}`;
  let stored = await kv.get(key, "json").catch(() => null);
  if (!stored) stored = { devices: [] };

  const now = Date.now();
  const existing = stored.devices.find(d => d.fp === deviceFingerprint);
  if (existing) {
    existing.lastUsed = now;
  } else {
    if (stored.devices.length >= MAX_DEVICES) {
      return Response.redirect(DEVICE_CONFLICT_URL, 302);
    }
    stored.devices.push({ fp: deviceFingerprint, lastUsed: now });
  }

  await kv.put(key, JSON.stringify(stored));

  // === 4️⃣ 加载下载配置 JSON ===
  let downloads;
  try {
    const res = await fetch(JSON_URL, { cache: "no-store" });
    const json = await res.json();
    downloads = json.downloads || [];
  } catch (err) {
    return new Response("🚫 无法加载下载配置文件: " + err.message, { status: 500 });
  }

  const target = downloads.find(d => String(d.zone) === String(zone));
  if (!target || !target.url) {
    return new Response(`🚫 未找到 Zone ${zone} 的下载链接`, { status: 404 });
  }

  // === 5️⃣ 跳转隐藏下载源 ===
  const redirectTo = `https://${url.hostname}/dl/${zone}`;
  return Response.redirect(redirectTo, 302);
}

/* === 🔍 平台识别（仅允许 Android / Windows）=== */
function detectPlatform(ua) {
  const uaLower = ua.toLowerCase();
  const isAndroid = uaLower.includes("android");
  const isWindows = uaLower.includes("windows nt");
  const isTV =
    uaLower.includes("aft") ||
    uaLower.includes("downloader") ||
    uaLower.includes("tv") ||
    uaLower.includes("googletv") ||
    uaLower.includes("tvbox") ||
    uaLower.includes("stick");

  // ❌ 禁止 iOS / macOS
  if (uaLower.includes("iphone") || uaLower.includes("ipad") || uaLower.includes("macintosh")) {
    return { allowed: false, platform: "Apple" };
  }

  if (isAndroid) {
    return { allowed: true, platform: isTV ? "Android-TV" : "Android" };
  }

  if (isWindows) {
    return { allowed: true, platform: "Windows" };
  }

  // 默认不允许
  return { allowed: false, platform: "Unknown" };
}

/* === 🔒 隐藏下载中转 === */
async function handleHiddenDownload(zoneId) {
  try {
    const JSON_URL =
      "https://raw.githubusercontent.com/PowerTech0417/LinksApp_worker/refs/heads/main/downloads.json";
    const res = await fetch(JSON_URL);
    const json = await res.json();
    const apps = json.downloads || [];

    const app = apps.find(x => String(x.zone) === String(zoneId));
    if (!app) return new Response("Not Found", { status: 404 });

    const fileRes = await fetch(app.url);
    const headers = new Headers(fileRes.headers);
    const safeName = encodeURIComponent(app.name || "App");
    headers.set(
      "Content-Disposition",
      `attachment; filename="${safeName}.apk"; filename*=UTF-8''${safeName}.apk`
    );
    headers.set("Cache-Control", "no-store");

    return new Response(fileRes.body, { status: 200, headers });
  } catch (err) {
    return new Response("Download error: " + err.message, { status: 500 });
  }
}

/* === 🔑 HMAC 签名 === */
async function sign(text, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

/* === 🧩 安全比较 === */
function timingSafeCompare(aHex, bHex) {
  if (aHex.length !== bHex.length) return false;
  let diff = 0;
  for (let i = 0; i < aHex.length; i++) diff |= aHex.charCodeAt(i) ^ bHex.charCodeAt(i);
  return diff === 0;
}

/* === 📱 稳定设备指纹（换网/换浏览器仍算同设备）=== */
async function getDeviceFingerprint(request, uid, secret, platform) {
  const ua = request.headers.get("User-Agent") || "";
  const lang = request.headers.get("Accept-Language") || "";

  // 去除浏览器差异（Chrome/Safari/Edge 等）
  const baseUA = ua
    .replace(/\s?(Chrome|Safari|Edge|Firefox|UCBrowser|Version)\/[^\s]+/gi, "")
    .replace(/;?\s+(wv|Mobile|Build\/[^\s)]+)/gi, "")
    .trim();

  const raw = `${uid}:${platform}:${baseUA}:${lang}`;
  return await sign(raw.toLowerCase(), secret);
}
