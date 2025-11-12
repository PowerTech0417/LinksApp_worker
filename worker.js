addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const uid = url.searchParams.get("uid");
  const zone = url.searchParams.get("zone") || "1";
  const sig = url.searchParams.get("sig");

  // === ⚙️ 配置区 ===
  const SIGN_SECRET = "mySuperSecretKey";
  const MAX_DEVICES = 3;

  // ✅ 五个下载链接（自定义替换）
  const DOWNLOAD_LINKS = {
    "1": "https://example.com/app1.apk",
    "2": "https://example.com/app2.apk",
    "3": "https://example.com/app3.apk",
    "4": "https://example.com/app4.apk",
    "5": "https://example.com/app5.apk",
  };

  const DEVICE_CONFLICT_URL = "https://life4u22.blogspot.com/p/id-ban.html";
  // =================

  // 参数检查
  if (!uid || !sig) {
    return new Response("🚫 Invalid parameters", { status: 403 });
  }

  // 签名验证
  const text = `${uid}:${zone}`;
  const expectedSig = await sign(text, SIGN_SECRET);
  if (!timingSafeCompare(expectedSig, sig)) {
    return new Response("🚫 Invalid signature", { status: 403 });
  }

  // 设备指纹
  const ua = request.headers.get("User-Agent") || "unknown";
  const fingerprint = await getFingerprint(ua, uid, SIGN_SECRET);

  // === 设备限制逻辑 ===
  const key = `uid:${uid}:zone:${zone}`;
  let record = await UID_BINDINGS.get(key, "json");

  if (!record) {
    record = { devices: [fingerprint] };
    await UID_BINDINGS.put(key, JSON.stringify(record));
  } else {
    const devices = record.devices || [];

    if (!devices.includes(fingerprint)) {
      if (devices.length >= MAX_DEVICES) {
        return Response.redirect(DEVICE_CONFLICT_URL, 302);
      }
      devices.push(fingerprint);
      await UID_BINDINGS.put(key, JSON.stringify({ devices }));
    }
  }

  // === 重定向到下载链接 ===
  const redirectUrl = DOWNLOAD_LINKS[zone] || DOWNLOAD_LINKS["1"];
  return Response.redirect(redirectUrl, 302);
}

/** 签名函数 (HMAC-SHA256) */
async function sign(text, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, "0")).join("");
}

/** 安全比较 */
function timingSafeCompare(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 设备指纹 */
async function getFingerprint(ua, uid, secret) {
  const base = `${uid}:${ua.toLowerCase().slice(0, 100)}`;
  return await sign(base, secret);
}
