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

  // === 2️⃣ 生成设备指纹（跨浏览器稳定） ===
  const deviceFingerprint = await getDeviceFingerprint(request, uid, SIGN_SECRET);

  // === 3️⃣ 检查 KV 存储 ===
  if (typeof UID_BINDINGS === "undefined") {
    return new Response("🚨 UID_BINDINGS KV not found.", { status: 503 });
  }

  const key = `uid:${uid}`;
  let stored = await UID_BINDINGS.get(key, "json").catch(() => null);
  const now = Date.now();

  if (!stored) stored = { devices: [] };

  // 检查是否已绑定当前设备
  const existing = stored.devices.find(d => d.fp === deviceFingerprint);
  if (existing) {
    existing.lastUsed = now;
  } else {
    if (stored.devices.length >= MAX_DEVICES) {
      return Response.redirect(DEVICE_CONFLICT_URL, 302);
    }
    stored.devices.push({ fp: deviceFingerprint, lastUsed: now });
  }

  // 永久保存（不清理、不覆盖）
  await UID_BINDINGS.put(key, JSON.stringify(stored));

  // === 4️⃣ 加载下载配置 JSON ===
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

  // === 5️⃣ 跳转隐藏下载源 ===
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

/* === 📱 平衡增强版 v3：跨浏览器稳定识别 === */
async function getDeviceFingerprint(request, uid, secret) {
  const ua = (request.headers.get("User-Agent") || "").toLowerCase();
  const acceptLang = request.headers.get("Accept-Language") || "";
  const dnt = request.headers.get("DNT") || "";

  // ✅ 提取核心系统信息
  let deviceInfo = "unknown";
  const androidMatch = ua.match(/android\s([\d.]+)/);
  const modelMatch = ua.match(/;\s*([^;]*?)\sbuild/i);
  const iosMatch = ua.match(/\((iphone|ipad|ipod).*?os\s([\d_]+)/);
  const tvMatch = ua.match(/(smart[- ]?tv|aft|mi|hisense|tcl|philips|bravia|firetv|shield)/i);

  if (androidMatch && modelMatch) {
    deviceInfo = `android-${androidMatch[1]}-${modelMatch[1].trim()}`;
  } else if (iosMatch) {
    deviceInfo = `ios-${iosMatch[1]}-${iosMatch[2].replace(/_/g, ".")}`;
  } else if (tvMatch) {
    deviceInfo = `tv-${tvMatch[1].toLowerCase()}`;
  } else if (ua.includes("windows")) {
    deviceInfo = "windows";
  } else if (ua.includes("mac os")) {
    deviceInfo = "macos";
  }

  // ✅ 去除浏览器特征（chrome、wv、mobile、edg 等）
  const normalized = deviceInfo.replace(/(chrome|version|wv|mobile|safari|edg|firefox)/gi, "").trim();

  // ✅ 最终指纹（基于系统特征 + UID）
  const raw = `${uid}:${normalized}:${acceptLang}:${dnt}`;
  return await sign(raw, secret);
}
