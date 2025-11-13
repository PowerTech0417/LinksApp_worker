addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request, event));
});

async function handleRequest(request, event) {
  const url = new URL(request.url);
  const path = url.pathname;

  // === ⚙️ 配置 ===
  const BLOCK_URL = "https://modskyshop168-sudo.github.io/cc/blocked.html";
  const KV_KEY_PREFIX = "uid:";

  // === 签名验证 ===（逻辑不变）
  const uid = url.searchParams.get("uid");
  if (!uid) return Response.redirect(BLOCK_URL, 302);

  const deviceFP = await getStableFingerprint(request);
  const kvKey = KV_KEY_PREFIX + uid;

  const record = await event.env.DEVICE_KV.get(kvKey, { type: "json" }) || { devices: [] };

  const now = Date.now();
  let devices = record.devices.filter(d => now - d.lastUsed < 365 * 24 * 3600 * 1000);

  // 检查是否已存在同设备
  const existing = devices.find(d => d.fp === deviceFP);
  if (existing) {
    existing.lastUsed = now;
  } else {
    devices.push({ fp: deviceFP, lastUsed: now });
  }

  // 限制设备数量 ≤ 3
  if (devices.length > 3) {
    return Response.redirect(BLOCK_URL, 302);
  }

  await event.env.DEVICE_KV.put(kvKey, JSON.stringify({ devices }));

  // === 下载中转逻辑 ===（保持不变）
  if (path.startsWith("/dl/")) {
    const target = url.searchParams.get("url");
    if (!target) return new Response("Missing target URL", { status: 400 });
    return Response.redirect(target, 302);
  }

  // === 默认响应 ===
  return new Response("OK", { status: 200 });
}

// === 🧠 改进的稳定设备指纹函数 ===
async function getStableFingerprint(request) {
  const ua = request.headers.get("User-Agent") || "";

  // 尽可能生成一致性指纹
  const baseInfo = [
    ua.replace(/\s+/g, ""),       // 去除UA空格，避免差异
    "HW:" + (await getHardwareHint(ua)), // 模糊硬件指示符
  ].join("|");

  const encoder = new TextEncoder();
  const data = encoder.encode(baseInfo);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// === 💡 模糊硬件识别辅助函数 ===
async function getHardwareHint(ua) {
  const platformMatch = ua.match(/\(([^)]+)\)/);
  const platformInfo = platformMatch ? platformMatch[1] : "unknown";
  const cleaned = platformInfo
    .replace(/Build\/[\w.-]+/gi, "")
    .replace(/Android\s*\d+/gi, "")
    .replace(/\s+/g, "")
    .toLowerCase();
  return cleaned.slice(0, 32);
}
