addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request, event));
});

async function handleRequest(request, event) {
  const url = new URL(request.url);
  const path = url.pathname;
  const params = url.searchParams;

  // === ⚙️ 配置区 ===
  const GITHUB_PAGES_URL = "https://modskyshop168-sudo.github.io/cc/";
  const DEVICE_CONFLICT_URL = "https://life4u22.blogspot.com/p/id-ban.html";
  const SIGN_SECRET = "mySuperSecretKey";
  const MAX_DEVICES = 3; // ✅ 允许最多 3 台设备
  // =================

  // === 参数验证 ===
  const uid = params.get("uid");
  const sig = params.get("sig");

  if (!uid || !sig) {
    return new Response("🚫 Invalid Link: Missing parameters", { status: 403 });
  }

  // === 签名验证（不含过期时间）===
  const text = `${uid}`;
  const expectedSig = await sign(text, SIGN_SECRET);
  if (!timingSafeCompare(expectedSig, sig)) {
    return new Response("🚫 Invalid Signature", { status: 403 });
  }

  // === 设备指纹 ===
  const ua = request.headers.get("User-Agent") || "unknown";
  const deviceFingerprint = await getDeviceFingerprint(ua, uid, SIGN_SECRET);

  // === KV 检查 ===
  if (typeof UID_BINDINGS === "undefined") {
    return new Response("Service unavailable. (KV missing)", { status: 503 });
  }

  const key = `uid:${uid}`;
  let stored = null;

  try {
    stored = await UID_BINDINGS.get(key, "json");
  } catch (e) {
    return new Response("Service temporarily unavailable. (KV read error)", { status: 503 });
  }

  // === 首次登入 → 新建记录 ===
  if (!stored) {
    const toStore = {
      devices: [deviceFingerprint],
      createdAt: new Date().toISOString()
    };
    await UID_BINDINGS.put(key, JSON.stringify(toStore));
  } 
  // === 已登入过 ===
  else {
    const devices = stored.devices || [];

    // 已存在 → 允许访问
    if (devices.includes(deviceFingerprint)) {
      // 不更新
    } 
    // 新设备 → 检查数量限制
    else if (devices.length < MAX_DEVICES) {
      devices.push(deviceFingerprint);
      await UID_BINDINGS.put(key, JSON.stringify({ devices, updatedAt: new Date().toISOString() }));
    } 
    // 超过 3 台 → 封锁
    else {
      return Response.redirect(DEVICE_CONFLICT_URL, 302);
    }
  }

  // ✅ 正常访问
  return fetch(`${GITHUB_PAGES_URL}${path}${url.search}`, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: "follow"
  });
}

/** 🔑 HMAC 签名生成 (SHA-256) */
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

/** ⏱ 时间安全比较 */
function timingSafeCompare(aHex, bHex) {
  if (aHex.length !== bHex.length) return false;
  let diff = 0;
  for (let i = 0; i < aHex.length; i++) diff |= aHex.charCodeAt(i) ^ bHex.charCodeAt(i);
  return diff === 0;
}

/** 📱 设备指纹 */
async function getDeviceFingerprint(ua, uid, secret) {
  const cleanUA = ua.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 120);
  const base = `${uid}:${cleanUA}`;
  return await sign(base, secret);
}
