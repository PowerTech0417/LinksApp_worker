// === ⚙️ Cloudflare Worker：限制每 UID 同时登录 ≤ 3 台设备 ===
// ✅ 改进版：同设备换浏览器 / 网络 不再重复计算
// ✅ 保持原逻辑完全不变

import { HmacSHA256, enc } from "crypto-js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // === 📦 下载中转 ===
    if (url.pathname.startsWith("/dl/")) {
      const uid = url.searchParams.get("uid");
      const file = url.pathname.replace("/dl/", "").trim();
      if (!uid || !file) return new Response("Invalid Link", { status: 400 });

      const deviceId = await getDeviceFingerprint(request, uid, env.SECRET_KEY);
      const kvKey = `uid:${uid}`;

      const data = (await env.UID_DEVICES.get(kvKey, "json")) || { devices: [] };

      // === 检查是否已有该设备 ===
      const exists = data.devices.find((d) => d.id === deviceId);

      if (!exists) {
        // 新设备 → 添加
        if (data.devices.length >= 3) {
          return new Response(
            "⚠️ 已超过3台设备使用限制，此下载链接已失效。",
            { status: 403 }
          );
        }
        data.devices.push({ id: deviceId, ts: Date.now() });
        await env.UID_DEVICES.put(kvKey, JSON.stringify(data)); // 永久保存
      }

      // === 🔗 转发下载 ===
      const redirectURL = await getDownloadURL(file, env);
      return Response.redirect(redirectURL, 302);
    }

    return new Response("OK");
  },
};

// === 🔒 签名函数 ===
async function sign(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// === 📱 改进版设备指纹算法 ===
// 目标：同设备换浏览器、换网络仍算同一设备
/* === 📱 改进版设备指纹（同设备换浏览器 / 换网络 不再重复） === */
async function getDeviceFingerprint(request, uid, secret) {
  const ua = (request.headers.get("User-Agent") || "").toLowerCase();
  const lang = (request.headers.get("Accept-Language") || "").toLowerCase();
  const accept = (request.headers.get("Accept") || "").toLowerCase();

  // ✅ 核心：去除浏览器/内核标识，只保留设备+系统特征
  let cleanedUA = ua
    // 删除常见浏览器标识
    .replace(/chrome\/[\d.]+/g, "")
    .replace(/crios\/[\d.]+/g, "")
    .replace(/version\/[\d.]+/g, "")
    .replace(/wv/g, "")
    .replace(/applewebkit\/[\d.]+/g, "")
    .replace(/safari\/[\d.]+/g, "")
    .replace(/mobile/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // ✅ 提取系统版本
  const androidVersion = (cleanedUA.match(/android\s*([\d._]+)/) || [])[1] || "android-unknown";

  // ✅ 提取设备型号
  const modelMatch = cleanedUA.match(/; ([^;]*?build)/i);
  const model = modelMatch ? modelMatch[1].replace(/build.*/i, "").trim() : "unknown-device";

  // ✅ 判断 TV / 手机
  const isTV = /tv|mitv|aft|smarttv|googletv|firetv/i.test(cleanedUA);
  const deviceType = isTV ? "TV" : "Mobile";

  // ✅ 生成稳定基因，不依赖浏览器差异
  const baseString = `${uid}:${deviceType}:${androidVersion}:${model}:${lang}:${accept}`;

  // 使用 HMAC-SHA256 生成稳定哈希
  return await sign(baseString, secret);
}
  // 生成统一设备签名
  const baseID = `${uid}:${isTV ? "TV" : "Mobile"}:${androidVersion}:${model}:${lang}`;
  return await sign(baseID, secret);
}

// === 🔗 生成实际下载地址 ===
async function getDownloadURL(file, env) {
  const downloads = JSON.parse(await env.DOWNLOADS_JSON);
  const found = downloads.downloads.find((d) =>
    d.url.includes(file) || d.name.replace(/\s+/g, "").toLowerCase() === file.toLowerCase()
  );
  return found ? found.url : "https://example.com/notfound";
}
