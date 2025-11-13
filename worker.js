addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  // === 📥 下载中转 ===
  if (url.pathname.startsWith("/dl/")) {
    const zoneId = url.pathname.split("/dl/")[1];
    return handleHiddenDownload(zoneId);
  }

  const params = url.searchParams;

  // === ⚙️ 配置区 ===
  const JSON_URL = "https://raw.githubusercontent.com/PowerTech0417/LinksApp_worker/refs/heads/main/downloads.json";
  const DEVICE_CONFLICT_URL = "https://life4u22.blogspot.com/p/not-found.html";
  const SIGN_SECRET = "mySuperSecretKey";
  const MAX_DEVICES = 3;
  // =================

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

  // === 2️⃣ 生成设备指纹（改进版） ===
  const deviceFingerprint = await getDeviceFingerprint(request, uid, SIGN_SECRET);

  // === 3️⃣ 检查 KV 存储 ===
  if (typeof UID_BINDINGS === "undefined") {
    return new Response("🚨 UID_BINDINGS KV not found.", { status: 503 });
  }

  const key = `uid:${uid}`;
  let stored = await UID_BINDINGS.get(key, "json").catch(() => null);
  const now = Date.now();

  if (!stored) stored = { devices: [] };

  const existing = stored.devices.find(d => d.fp === deviceFingerprint);
  if (existing) {
    existing.lastUsed = now;
  } else {
    if (stored.devices.length >= MAX_DEVICES) {
      return Response.redirect(DEVICE_CONFLICT_URL, 302);
    }
    stored.devices.push({ fp: deviceFingerprint, lastUsed: now });
  }

  await UID_BINDINGS.put(key, JSON.stringify(stored));

  // === 4️⃣ 加载下载配置 ===
  let downloads;
  try {
    const res = await fetch(JSON_URL, { cache: "no-store" });
    const json = await res.json();
    downloads = json.downloads || [];
  } catch {
    return new Response("🚫 无法加载下载配置文件", { status: 500 });
  }

  const target = downloads.find(d => String(d.zone) === String(zone));
  if (!target || !target.url) {
    return new Response(`🚫 未找到 Zone ${zone} 的下载链接`, { status: 404 });
  }

  // === 5️⃣ 跳转隐藏下载 ===
  const redirectTo = `https://${url.hostname}/dl/${zone}`;
  return Response.redirect(redirectTo, 302);
}

/* === 📦 隐藏下载中转 === */
async function handleHiddenDownload(zoneId) {
  try {
    const JSON_URL = "https://raw.githubusercontent.com/PowerTech0417/LinksApp_worker/refs/heads/main/downloads.json";
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
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/* === 🧩 安全比较 === */
function timingSafeCompare(aHex, bHex) {
  if (aHex.length !== bHex.length) return false;
  let diff = 0;
  for (let i = 0; i < aHex.length; i++) diff |= aHex.charCodeAt(i) ^ bHex.charCodeAt(i);
  return diff === 0;
}

/* === 📱 改进版设备指纹算法 ===
   ✅ 同设备 → 任意浏览器 / 网络 / 系统版本都算同一台
   🔒 核心依据：设备型号 + 屏幕信息（UA中提取）
*/
async function getDeviceFingerprint(request, uid, secret) {
  const ua = (request.headers.get("User-Agent") || "").toLowerCase();

  // 提取主要设备信息
  let deviceModel = "unknown-device";

  // 常见 Android / TV UA 中的设备型号匹配
  const match = ua.match(/; ([^;]*build\/[^;)]+)/i);
  if (match && match[1]) {
    deviceModel = match[1].replace(/build.*/i, "").trim();
  } else if (ua.includes("iphone")) {
    deviceModel = "iphone";
  } else if (ua.includes("ipad")) {
    deviceModel = "ipad";
  } else if (ua.includes("miui") || ua.includes("redmi") || ua.includes("xiaomi")) {
    deviceModel = "xiaomi";
  } else if (ua.includes("huawei")) {
    deviceModel = "huawei";
  } else if (ua.includes("samsung")) {
    deviceModel = "samsung";
  } else if (ua.includes("tv") || ua.includes("aft")) {
    deviceModel = "android-tv";
  }

  const modelHashInput = `${uid}:${deviceModel}`;
  return await sign(modelHashInput, secret);
}
