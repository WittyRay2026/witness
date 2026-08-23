import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import type { CaptionCue, VideoMetadata } from "./types";
import { cuesFromJson3, cuesFromVtt, pickBestCaptionLang } from "./captions";
import { mediaDir, ytDlpJson, ytDlpDownload, cleanYtError } from "./exec";
import { BROWSER_UA } from "./url";

interface YtFetch {
  metadata: VideoMetadata;
  captions: CaptionCue[];
  captionKind: "official" | "auto" | "none";
  storyboardHints: string[];
}

export async function fetchYouTube(videoId: string): Promise<YtFetch> {
  const dir = mediaDir("youtube", videoId);
  const cache = path.join(dir, "yt-meta.json");
  let raw: Record<string, unknown>;
  if (existsSync(cache)) raw = JSON.parse(await readFile(cache, "utf8"));
  else {
    raw = await ytDlpJson(`https://www.youtube.com/watch?v=${videoId}`);
    await writeFile(cache, JSON.stringify(raw));
  }
  const chapters = Array.isArray(raw.chapters)
    ? (raw.chapters as { start_time?: number; end_time?: number; title?: string }[]).map((c) => ({ start: c.start_time ?? 0, end: c.end_time, title: c.title ?? "" }))
    : [];
  const metadata: VideoMetadata = {
    platform: "youtube", platformId: videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`, canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    title: String(raw.title ?? ""), description: String(raw.description ?? ""),
    creatorName: String(raw.uploader ?? raw.channel ?? raw.creator ?? ""),
    creatorId: raw.channel_id ? String(raw.channel_id) : undefined,
    creatorUrl: raw.channel_url ? String(raw.channel_url) : raw.uploader_url ? String(raw.uploader_url) : undefined,
    publishedAt: raw.upload_date ? formatYtDate(String(raw.upload_date)) : undefined,
    durationSec: typeof raw.duration === "number" ? raw.duration : undefined,
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    category: raw.categories ? String(Array.isArray(raw.categories) ? raw.categories[0] : raw.categories) : undefined,
    viewCount: num(raw.view_count), likeCount: num(raw.like_count), commentCount: num(raw.comment_count),
    chapters, thumbnailUrl: raw.thumbnail ? String(raw.thumbnail) : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    extra: { availability: raw.availability == null ? null : String(raw.availability) },
  };
  const { cues, kind } = await loadYoutubeCaptions(videoId, raw, dir);
  return { metadata, captions: cues, captionKind: kind, storyboardHints: youtubePreviewThumbs(videoId) };
}

async function loadYoutubeCaptions(videoId: string, raw: Record<string, unknown>, dir: string): Promise<{ cues: CaptionCue[]; kind: "official" | "auto" | "none" }> {
  const cached = path.join(dir, "captions.json");
  if (existsSync(cached)) return JSON.parse(await readFile(cached, "utf8"));
  const official = (raw.subtitles ?? {}) as Record<string, { ext?: string; url?: string }[]>;
  const auto = (raw.automatic_captions ?? {}) as Record<string, { ext?: string; url?: string }[]>;
  const tryLangs = async (map: Record<string, { ext?: string; url?: string }[]>, kind: "official" | "auto") => {
    const lang = pickBestCaptionLang(Object.keys(map));
    if (!lang) return null;
    const tracks = map[lang] ?? [];
    const track = tracks.find((t) => t.ext === "json3") ?? tracks.find((t) => t.ext === "vtt") ?? tracks[0];
    if (!track?.url) return null;
    try {
      const res = await fetch(track.url, { headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) return null;
      const body = await res.text();
      const cues = track.ext === "json3" || body.trim().startsWith("{") ? cuesFromJson3(JSON.parse(body)) : cuesFromVtt(body);
      if (!cues.length) return null;
      return { cues, kind };
    } catch { return null; }
  };
  let got = await tryLangs(official, "official");
  if (!got) got = await tryLangs(auto, "auto");
  const result = got ?? { cues: [] as CaptionCue[], kind: "none" as const };
  await writeFile(cached, JSON.stringify(result));
  return result;
}

export function youtubePreviewThumbs(videoId: string): string[] {
  return [`https://i.ytimg.com/vi/${videoId}/hq1.jpg`, `https://i.ytimg.com/vi/${videoId}/hq2.jpg`, `https://i.ytimg.com/vi/${videoId}/hq3.jpg`, `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`];
}
function num(v: unknown): number | undefined { return typeof v === "number" && Number.isFinite(v) ? v : undefined; }
function formatYtDate(yyyymmdd: string): string | undefined {
  if (!/^\d{8}$/.test(yyyymmdd)) return undefined;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}
export function youtubeMediaHint(err: string): string {
  const e = err.toLowerCase();
  if (e.includes("403") || e.includes("sign in") || e.includes("bot") || e.includes("po token")) {
    return "YouTube 媒体流被拦截。本次只能使用字幕与资料，不能声称已观看完整画面。";
  }
  return cleanYtError(err);
}
