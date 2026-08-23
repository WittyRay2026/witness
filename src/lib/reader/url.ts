import type { ParsedVideoUrl, Platform } from "./types";

const YT_HOSTS = new Set(["youtube.com","www.youtube.com","m.youtube.com","music.youtube.com","youtu.be","www.youtu.be","youtube-nocookie.com","www.youtube-nocookie.com"]);
const BILI_HOSTS = new Set(["www.bilibili.com","bilibili.com","m.bilibili.com","b23.tv","b23.wtf","www.b23.tv"]);
const X_HOSTS = new Set(["x.com","www.x.com","twitter.com","www.twitter.com","mobile.twitter.com","mobile.x.com","vxtwitter.com","fxtwitter.com"]);

function hostOf(raw: string): string { try { return new URL(raw).hostname.toLowerCase(); } catch { return ""; } }

export function extractYouTubeId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.hostname === "youtu.be" || u.hostname === "www.youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }
    const v = u.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return v;
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => ["embed","shorts","live","v"].includes(p));
    if (idx >= 0 && parts[idx + 1] && /^[\w-]{11}$/.test(parts[idx + 1])) return parts[idx + 1];
  } catch { return null; }
  return null;
}

export function extractBiliId(input: string): { bvid?: string; aid?: string } {
  const t = input.trim();
  const bv = t.match(/BV[0-9A-Za-z]{8,12}/i);
  if (bv) return { bvid: bv[0].replace(/^bv/i, "BV") };
  const av = t.match(/(?:av|AV)(\d+)/);
  if (av) return { aid: av[1] };
  try {
    const u = new URL(t);
    const bvm = u.pathname.match(/BV[0-9A-Za-z]{8,12}/i);
    if (bvm) return { bvid: bvm[0].replace(/^bv/i, "BV") };
    const avm = u.pathname.match(/av(\d+)/i);
    if (avm) return { aid: avm[1] };
  } catch {}
  return {};
}

export function extractTweetId(input: string): string | null {
  const t = input.trim();
  if (/^\d{8,22}$/.test(t)) return t;
  const m = t.match(/(?:status(?:es)?|i\/web\/status)\/(\d{8,22})/i);
  return m?.[1] ?? null;
}

export function pickUrlFromShare(raw: string): string {
  const t = raw.trim().replace(/^\uFEFF/, "");
  if (!t) return "";
  try {
    const u = new URL(t);
    if (u.protocol === "http:" || u.protocol === "https:") {
      const nested = u.searchParams.get("url") || u.searchParams.get("u") || u.searchParams.get("q");
      if (nested && /^https?:\/\//i.test(nested) && /youtube|youtu\.be|bilibili|b23\.|twitter|x\.com/i.test(nested)) return nested;
      return u.toString();
    }
  } catch {}
  const m = t.match(/https?:\/\/[^\s<>"'）】\]]+/i);
  if (m) return m[0].replace(/[.,;:!?\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F]+$/, "");
  return t;
}

export function isXProfileOrNonStatus(url: string): boolean {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (!X_HOSTS.has(u.hostname.toLowerCase())) return false;
    if (/\/status(?:es)?\/\d{8,22}/i.test(u.pathname)) return false;
    if (/\/i\/spaces\//i.test(u.pathname)) return false;
    return true;
  } catch { return false; }
}

export function guessPlatform(input: string): Platform {
  const host = hostOf(input);
  if (YT_HOSTS.has(host) || extractYouTubeId(input)) return "youtube";
  if (BILI_HOSTS.has(host) || /BV[0-9A-Za-z]{8,12}/i.test(input) || /(?:^|\/)av\d+/i.test(input)) return "bilibili";
  if (X_HOSTS.has(host) || /(?:twitter|x)\.com\/.+\/status/i.test(input)) return "x";
  return "generic";
}

export const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function resolveShortUrl(url: string): Promise<string> {
  try {
    const u = new URL(url);
    if (!["b23.tv","www.b23.tv","b23.wtf","t.co","youtu.be"].includes(u.hostname)) return url;
    const res = await fetch(url, { method: "GET", redirect: "follow", headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(12_000) });
    return res.url || url;
  } catch { return url; }
}

export async function parseVideoUrl(input: string): Promise<ParsedVideoUrl> {
  const cleaned = pickUrlFromShare(input);
  const raw = cleaned.trim();
  if (!raw) throw new Error("请输入链接");
  const resolved = raw.startsWith("http") ? await resolveShortUrl(raw) : raw;
  const look = resolved.startsWith("http") ? resolved : raw;
  const platform = guessPlatform(look);
  if (platform === "youtube") {
    const id = extractYouTubeId(resolved) ?? extractYouTubeId(raw);
    if (!id) throw new Error("这不是一条 YouTube 视频。");
    return { platform, platformId: id, url: raw.startsWith("http") ? raw : `https://www.youtube.com/watch?v=${id}`, canonicalUrl: `https://www.youtube.com/watch?v=${id}` };
  }
  if (platform === "bilibili") {
    const ids = extractBiliId(resolved);
    const fallback = extractBiliId(raw);
    const bvid = ids.bvid ?? fallback.bvid;
    const aid = ids.aid ?? fallback.aid;
    if (!bvid && !aid) throw new Error("无法解析 Bilibili BV/AV 号。");
    const platformId = bvid ?? `av${aid}`;
    return { platform, platformId, url: raw.startsWith("http") ? raw : `https://www.bilibili.com/video/${platformId}`, canonicalUrl: `https://www.bilibili.com/video/${platformId}`, extra: { bvid: bvid ?? "", aid: aid ?? "" } };
  }
  if (platform === "x" || X_HOSTS.has(hostOf(look))) {
    const id = extractTweetId(resolved) ?? extractTweetId(raw);
    if (!id) throw new Error("这是 X 账号或时间线，不是一条推文。请分享带 /status/ 的那一条。");
    return { platform: "x", platformId: id, url: raw.startsWith("http") ? raw : `https://x.com/i/status/${id}`, canonicalUrl: `https://x.com/i/status/${id}` };
  }
  if (!raw.startsWith("http")) throw new Error("暂不识别该平台。");
  return { platform: "generic", platformId: encodeURIComponent(resolved).slice(0, 80), url: raw, canonicalUrl: resolved, extra: { host: hostOf(resolved) } };
}

export function videoCacheId(platform: Platform, platformId: string): string {
  return `${platform}--${platformId}`;
}
