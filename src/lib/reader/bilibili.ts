import { createHash } from "node:crypto";
import { writeFile, readFile } from "node:fs/promises";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import type { CaptionCue, VideoMetadata } from "./types";
import { cuesFromBiliJson } from "./captions";
import { mediaDir } from "./exec";
import { BROWSER_UA, extractBiliId } from "./url";
const MIXIN = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
export async function fetchBilibili(platformId: string) {
  const ids = extractBiliId(platformId);
  const dir = mediaDir("bilibili", platformId);
  const cache = path.join(dir, "bili-view.json");
  let view: Record<string, unknown>;
  if (existsSync(cache)) view = JSON.parse(await readFile(cache, "utf8"));
  else {
    const qs = ids.bvid ? `bvid=${ids.bvid}` : `aid=${ids.aid}`;
    const json = await biliGet(`https://api.bilibili.com/x/web-interface/view?${qs}`);
    if (json.code !== 0 || !json.data) throw new Error(`Bilibili view 失败：${json.message || json.code}`);
    view = json.data as Record<string, unknown>;
    await writeFile(cache, JSON.stringify(view));
  }
  const owner = (view.owner ?? {}) as { mid?: number; name?: string };
  const stat = (view.stat ?? {}) as Record<string, number>;
  const pages = Array.isArray(view.pages) ? (view.pages as { cid: number; part: string; duration?: number }[]).map((p) => ({ cid: String(p.cid), title: p.part, duration: p.duration })) : [];
  const bvid = String(view.bvid ?? ids.bvid ?? platformId);
  const aid = String(view.aid ?? ids.aid ?? "");
  const cid = String(view.cid ?? pages[0]?.cid ?? "");
  const metadata: VideoMetadata = {
    platform: "bilibili", platformId: bvid, url: `https://www.bilibili.com/video/${bvid}`, canonicalUrl: `https://www.bilibili.com/video/${bvid}`,
    title: String(view.title ?? ""), description: String(view.desc ?? ""), creatorName: owner.name ?? "",
    creatorId: owner.mid != null ? String(owner.mid) : undefined, creatorUrl: owner.mid != null ? `https://space.bilibili.com/${owner.mid}` : undefined,
    publishedAt: view.pubdate ? new Date(Number(view.pubdate) * 1000).toISOString() : undefined,
    durationSec: typeof view.duration === "number" ? view.duration : undefined,
    tags: Array.isArray(view.tags) ? (view.tags as { tag_name?: string }[]).map((t) => t.tag_name ?? "").filter(Boolean) : typeof view.tname === "string" ? [view.tname] : [],
    category: (view.tname as string) || undefined, viewCount: stat.view, likeCount: stat.like, favoriteCount: stat.favorite, shareCount: stat.share, commentCount: stat.reply,
    chapters: [], thumbnailUrl: view.pic ? String(view.pic).replace(/^http:/, "https:") : undefined, pages, extra: { aid, cid },
  };
  return { metadata, ...(await loadBiliCaptions(bvid, aid, cid, dir, view)) };
}
export async function acquireBilibiliMedia(meta: VideoMetadata) {
  const dir = mediaDir("bilibili", meta.platformId); const notes: string[] = [];
  const aid = String(meta.extra.aid ?? ""); const cid = String(meta.extra.cid ?? ""); const bvid = meta.platformId;
  const shotUrls: string[] = []; const shotDir = path.join(dir, "shots");
  const existingVideo = ["video.mp4","video.m4s"].map((n) => path.join(dir, n)).find((p) => existsSync(p));
  const existingAudio = ["audio.m4a","audio.mp3","audio.mp4"].map((n) => path.join(dir, n)).find((p) => existsSync(p));
  if (existingVideo || existingAudio) {
    notes.push("使用已缓存的 B 站音视频。");
    if (existsSync(shotDir)) for (const f of readdirSync(shotDir).filter((x) => x.endsWith(".jpg"))) shotUrls.push(path.join(shotDir, f));
    return { videoPath: existingVideo, audioPath: existingAudio, shotUrls, notes };
  }
  try { const durl = await biliGet(`https://api.bilibili.com/x/player/playurl?bvid=${encodeURIComponent(bvid)}&cid=${cid}&qn=16&fnval=1&fourk=0`); const url = (durl.data as { durl?: { url?: string }[] } | null)?.durl?.[0]?.url; if (url) { await downloadCdn(url, path.join(dir, "video.mp4"), bvid, 80_000_000); notes.push("已用 B 站官方 playurl 下载视频。"); } } catch (err) { notes.push(`B 站 MP4：${err instanceof Error ? err.message : String(err)}`); }
  try { const dash = await biliGet(`https://api.bilibili.com/x/player/playurl?bvid=${encodeURIComponent(bvid)}&cid=${cid}&qn=16&fnval=16&fourk=0`); const a = (dash.data as { dash?: { audio?: { baseUrl?: string; base_url?: string }[] } } | null)?.dash?.audio?.[0]; const audioUrl = a?.baseUrl || a?.base_url; if (audioUrl) { await downloadCdn(audioUrl, path.join(dir, "audio.m4a"), bvid, 40_000_000); notes.push("已用 B 站 DASH 音轨下载。"); } } catch (err) { notes.push(`B 站音轨：${err instanceof Error ? err.message : String(err)}`); }
  try {
    const shot = await biliGet(`https://api.bilibili.com/x/player/videoshot?aid=${aid}&cid=${cid}&index=1`);
    const images = ((shot.data as { image?: string[] } | null)?.image ?? []).map((u) => (u.startsWith("//") ? `https:${u}` : u.replace(/^http:/, "https:")));
    mkdirSync(shotDir, { recursive: true });
    for (let i = 0; i < images.length; i++) { const dest = path.join(shotDir, `shot_${String(i + 1).padStart(3, "0")}.jpg`); try { await downloadCdn(images[i], dest, bvid, 8_000_000); shotUrls.push(dest); } catch {} }
    if (shotUrls.length) notes.push(`已取 B 站 videoshot ${shotUrls.length} 张。`);
  } catch (err) { notes.push(`B 站采样帧：${err instanceof Error ? err.message : String(err)}`); }
  return { videoPath: ["video.mp4","video.m4s"].map((n) => path.join(dir, n)).find((p) => existsSync(p)), audioPath: ["audio.m4a","audio.mp3","audio.mp4"].map((n) => path.join(dir, n)).find((p) => existsSync(p)), shotUrls, notes };
}
async function loadBiliCaptions(bvid: string, aid: string, cid: string, dir: string, view: Record<string, unknown>) {
  const cached = path.join(dir, "captions.json");
  if (existsSync(cached)) return JSON.parse(await readFile(cached, "utf8")) as { captions: CaptionCue[]; captionKind: "official" | "ai" | "none" };
  type T = { lan?: string; lan_doc?: string; subtitle_url?: string; url?: string; id_str?: string; type?: number; ai_type?: number; ai_status?: number };
  const isAi = (t: T) => Boolean(t.ai_type || t.ai_status || `${t.lan ?? ""}${t.lan_doc ?? ""}`.toLowerCase().includes("ai") || (t.type != null && t.type !== 0));
  let tracks = (((view.subtitle as { list?: T[] }) ?? {}).list ?? []) as T[];
  if (!tracks.length && cid) {
    try { const player = await biliGet(`https://api.bilibili.com/x/player/wbi/v2?aid=${aid}&cid=${cid}&bvid=${bvid}`, true); tracks = ((player.data as { subtitle?: { subtitles?: T[] } }) ?? {}).subtitle?.subtitles ?? []; }
    catch { try { const player = await biliGet(`https://api.bilibili.com/x/player/v2?aid=${aid}&cid=${cid}`); tracks = ((player.data as { subtitle?: { subtitles?: T[] } }) ?? {}).subtitle?.subtitles ?? []; } catch { tracks = []; } }
  }
  for (const track of [...tracks.filter((t) => !isAi(t)), ...tracks.filter(isAi)]) {
    const url = track.subtitle_url || track.url; if (!url) continue;
    try {
      const res = await fetch(url.startsWith("//") ? `https:${url}` : url, { headers: { "User-Agent": BROWSER_UA, Referer: "https://www.bilibili.com" }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) continue;
      const captions = cuesFromBiliJson(await res.json()); if (!captions.length) continue;
      const out = { captions, captionKind: (isAi(track) ? "ai" : "official") as "official" | "ai" };
      await writeFile(cached, JSON.stringify(out)); return out;
    } catch { continue; }
  }
  const out = { captions: [] as CaptionCue[], captionKind: "none" as const }; await writeFile(cached, JSON.stringify(out)); return out;
}
async function biliGet(url: string, wbi = false) {
  let finalUrl = url; if (wbi) { try { finalUrl = await signWbi(url); } catch { finalUrl = url; } }
  const res = await fetch(finalUrl, { headers: { "User-Agent": BROWSER_UA, Referer: "https://www.bilibili.com", Origin: "https://www.bilibili.com" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Bilibili HTTP ${res.status}`);
  return (await res.json()) as { code: number; message?: string; data?: unknown };
}
let wbiCache: { mixin: string; t: number } | null = null;
async function signWbi(url: string) {
  const u = new URL(url); const mixin = await getMixinKey(); const params: Record<string, string> = {}; u.searchParams.forEach((v, k) => { params[k] = v; }); params.wts = String(Math.floor(Date.now() / 1000));
  const cleaned: Record<string, string> = {}; for (const [k, v] of Object.entries(params)) cleaned[k] = v.replace(/[!'()*]/g, "");
  const query = Object.keys(cleaned).sort().map((k) => `${k}=${encodeURIComponent(cleaned[k])}`).join("&");
  return `${u.origin}${u.pathname}?${query}&w_rid=${createHash("md5").update(query + mixin).digest("hex")}`;
}
async function getMixinKey() {
  if (wbiCache && Date.now() - wbiCache.t < 3600_000) return wbiCache.mixin;
  const res = await fetch("https://api.bilibili.com/x/web-interface/nav", { headers: { "User-Agent": BROWSER_UA, Referer: "https://www.bilibili.com" }, signal: AbortSignal.timeout(10_000) });
  const json = (await res.json()) as { data?: { wbi_img?: { img_url?: string; sub_url?: string } } };
  const img = json.data?.wbi_img?.img_url?.split("/").pop()?.split(".")[0] ?? ""; const sub = json.data?.wbi_img?.sub_url?.split("/").pop()?.split(".")[0] ?? "";
  const mixin = MIXIN.map((i) => (img + sub)[i] ?? "").join("").slice(0, 32); wbiCache = { mixin, t: Date.now() }; return mixin;
}
export async function listCreatorVideos(mid: string, pageSize = 30) {
  try { const json = await biliGet(`https://api.bilibili.com/x/space/wbi/arc/search?mid=${mid}&ps=${pageSize}&pn=1&order=pubdate`, true); return ((json.data as { list?: { vlist?: { bvid: string; title: string; created: number; play: number; length: string }[] } })?.list?.vlist) ?? []; }
  catch { const fallback = await biliGet(`https://api.bilibili.com/x/space/arc/search?mid=${mid}&ps=${pageSize}&pn=1`); return ((fallback.data as { list?: { vlist?: { bvid: string; title: string; created: number; play: number; length: string }[] } })?.list?.vlist) ?? []; }
}
async function downloadCdn(url: string, dest: string, bvid: string, maxBytes: number) {
  const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA, Referer: `https://www.bilibili.com/video/${bvid}`, Origin: "https://www.bilibili.com" }, signal: AbortSignal.timeout(90_000) });
  if (!res.ok) throw new Error(`CDN HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer()); if (buf.length > maxBytes) throw new Error(`文件过大`); if (buf.length < 64) throw new Error("空文件"); await writeFile(dest, buf);
}
