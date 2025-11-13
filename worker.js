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
  const DEVICE_CONFLICT_URL = "https://life4u22.blogspot.com/p/id-ban.html";
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

  // === 2️⃣ 获取设备指纹 ===
  const ua = request.headers.get("User-Agent") || "unknown";
  const deviceFingerprint = await getDeviceFingerprint(ua, uid, SIGN_SECRET);

  // === 3️⃣ 检查设备绑定 KV ===
  if (typeof UID_BINDINGS === "undefined") {
    return new Response("🚨 UID_BINDINGS KV not found.", { status: 503 });
  }

  const key = `uid:${uid}`;
  let stored = await UID_BINDINGS.get(key, "json").catch(() => null);

  if (!stored) {
    stored = { devices: [deviceFingerprint], createdAt: new Date().toISOString() };
    await UID_BINDINGS.put(key, JSON.stringify(stored));
  } else {
    const devices = stored.devices || [];
    if (!devices.includes(deviceFingerprint)) {
      if (devices.length >= MAX_DEVICES) {
        return Response.redirect(DEVICE_CONFLICT_URL, 302);
      }
      devices.push(deviceFingerprint);
      await UID_BINDINGS.put(key, JSON.stringify({ devices, updatedAt: new Date().toISOString() }));
    }
  }

  // === 4️⃣ 从 GitHub JSON 自动读取下载链接 ===
  let downloads;
  try {
    const res = await fetch(JSON_URL, { cache: "no-store" });
    const json = await res.json();
    downloads = json.downloads || [];
  } catch (e) {
    return new Response("🚫 无法加载下载配置文件", { status: 500 });
  }

  const target = downloads.find(d => String(d.zone) === String(zone));
  if (!target || !target.url) {
    return new Response(`🚫 未找到 Zone ${zone} 的下载链接`, { status: 404 });
  }

  // === 5️⃣ 隐藏真实下载源 ===
  const redirectTo = `https://${url.hostname}/dl/${zone}`;
  return Response.redirect(redirectTo, 302);
}

/* === 🔒 隐藏下载中转（支持中文文件名） === */
async function handleHiddenDownload(zoneId) {
  try {
    const JSON_URL = "https://raw.githubusercontent.com/PowerTech0417/LinksApp_worker/refs/heads/main/downloads.json";
    const res = await fetch(JSON_URL);
    const json = await res.json();
    const apps = json.downloads || [];

    const app = apps.find(x => String(x.zone) === String(zoneId));
    if (!app) return new Response("Not Found", { status: 404 });

    // 📦 隐藏真实源并自动命名（支持中文 UTF-8）
    const fileRes = await fetch(app.url);
    const headers = new Headers(fileRes.headers);

    const safeName = app.name ? encodeURIComponent(app.name) : "App";
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

/* === 🔑 签名函数 === */
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

/* === 📱 设备指纹 === */
async function getDeviceFingerprint(ua, uid, secret) {
  const cleanUA = ua.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
  const base = `${uid}:${cleanUA}`;
  return await sign(base, secret);
}
