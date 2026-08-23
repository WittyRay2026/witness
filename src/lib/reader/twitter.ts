import { writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { VideoMetadata } from "./types";
import { mediaDir, ytDlpJson } from "./exec";
import { BROWSER_UA } from "./url";

export interface XFetch {
  v?: number;
  metadata: VideoMetadata;
  mediaUrls: string[];
  photoUrls: string[];
  kind: "video" | "photos" | "text" | "unknown";
  notes: string[];
  loginLikely: boolean;
}

export async function fetchX(statusId: string): Promise<XFetch> {
  const dir = mediaDir("x", statusId);
  const cache = path.join(dir, "x-meta.json");
  if (existsSync(cache)) {
    const cached = JSON.parse(await readFile(cache, "utf8")) as XFetch & { v?: number };
    if (cached.v === 2 && cached.kind) return cached;
  }
  const notes: string[] = [];
  let metadata: VideoMetadata | null = null;
  let mediaUrls: string[] = [];
  let photoUrls: string[] = [];
  let kind: XFetch["kind"] = "unknown";
  let loginLikely = false;
  const fx = await tryFx(statusId);
  if (fx) {
    metadata = fx.metadata;
    mediaUrls = fx.mediaUrls;
    photoUrls = fx.photoUrls;
    kind = fx.kind;
    notes.push("已通过公开接口读取推文正文与附件。");
  }
  if (!metadata) {
    const oem = await tryOembed(statusId);
    if (oem) {
      metadata = oem;
      kind = "text";
      notes.push("仅获得 oEmbed 摘要，尚未确认是否有视频。");
    }
  }
  const looksLikeVideo = kind === "video" || mediaUrls.length > 0;
  if (looksLikeVideo) {
    try {
      const raw = await ytDlpJson(`https://x.com/i/status/${statusId}`);
      const duration = typeof raw.duration === "number" ? raw.duration : undefined;
      const title = String(raw.title ?? raw.description ?? metadata?.title ?? `Tweet ${statusId}`);
      const formats = Array.isArray(raw.formats) ? (raw.formats as { url?: string }[]) : [];
      const fromYt = formats.map((f) => f.url).filter((u): u is string => Boolean(u));
      mediaUrls = unique([...mediaUrls, ...fromYt.filter((u) => /\.(mp4|m3u8)(\?|$)/i.test(u))]);
      metadata = {
        platform: "x", platformId: statusId,
        url: `https://x.com/i/status/${statusId}`, canonicalUrl: `https://x.com/i/status/${statusId}`,
        title, description: String(raw.description ?? metadata?.description ?? ""),
        creatorName: String(raw.uploader ?? raw.creator ?? metadata?.creatorName ?? ""),
        creatorId: raw.uploader_id ? String(raw.uploader_id) : metadata?.creatorId,
        creatorUrl: raw.uploader_url ? String(raw.uploader_url) : metadata?.creatorUrl,
        publishedAt: raw.timestamp ? new Date(Number(raw.timestamp) * 1000).toISOString() : metadata?.publishedAt,
        durationSec: duration ?? metadata?.durationSec, tags: [],
        likeCount: num(raw.like_count), commentCount: num(raw.comment_count),
        shareCount: num(raw.repost_count ?? raw.retweet_count), viewCount: num(raw.view_count),
        chapters: [], thumbnailUrl: raw.thumbnail ? String(raw.thumbnail) : metadata?.thumbnailUrl,
        extra: { extractor: "yt-dlp", contentKind: "video" },
      };
      kind = "video";
      notes.push("yt-dlp 已解析该推文的公开视频。");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notes.push(`未能用 yt-dlp 拉取视频流：${msg.slice(0, 180)}`);
      if (/cookie|login|authenticate|NSFW|age|protected/i.test(msg)) loginLikely = true;
    }
  } else if (kind === "photos") {
    notes.push("这是图片推文，不是视频帖。");
  } else if (kind === "text") {
    notes.push("这是纯文字推文，没有视频。");
  }
  if (!metadata) {
    metadata = {
      platform: "x", platformId: statusId,
      url: `https://x.com/i/status/${statusId}`, canonicalUrl: `https://x.com/i/status/${statusId}`,
      title: `X status ${statusId}`, description: "", creatorName: "", tags: [], chapters: [],
      extra: { contentKind: kind },
    };
    notes.push("未能读取推文正文。");
    loginLikely = true;
  } else {
    metadata.extra = { ...metadata.extra, contentKind: kind };
  }
  const result: XFetch = { v: 2, metadata, mediaUrls, photoUrls, kind, notes, loginLikely };
  await writeFile(cache, JSON.stringify(result));
  return result;
}

async function tryFx(statusId: string) {
  const urls = [`https://api.fxtwitter.com/status/${statusId}`, `https://api.vxtwitter.com/Twitter/status/${statusId}`];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA, Accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
      if (!res.ok) continue;
      const data = (await res.json()) as Record<string, unknown>;
      const tweet = (data.tweet ?? data) as Record<string, unknown>;
      const user = (tweet.author ?? tweet.user ?? {}) as Record<string, unknown>;
      const media = (tweet.media ?? {}) as { videos?: { url?: string; thumbnail_url?: string }[]; photos?: { url?: string }[]; all?: { type?: string; url?: string }[] };
      const videoList = Array.isArray(tweet.video) ? (tweet.video as { url?: string }[]) : media.videos ?? [];
      const mediaUrls = videoList.map((v) => v.url).filter((u): u is string => Boolean(u));
      const fromAll = (media.all ?? []).filter((m) => /video|gif/i.test(m.type ?? "") && m.url).map((m) => m.url as string);
      const videos = unique([...mediaUrls, ...fromAll]);
      const photos = unique([...(media.photos ?? []).map((p) => p.url).filter((u): u is string => Boolean(u)), ...(media.all ?? []).filter((m) => /photo|image/i.test(m.type ?? "") && m.url).map((m) => m.url as string)]);
      const text = String(tweet.text ?? tweet.full_text ?? "");
      if (!text && !videos.length && !photos.length) continue;
      const kind: XFetch["kind"] = videos.length ? "video" : photos.length ? "photos" : "text";
      const thumb = (videoList[0] as { thumbnail_url?: string } | undefined)?.thumbnail_url ?? photos[0];
      return {
        mediaUrls: videos, photoUrls: photos, kind,
        metadata: {
          platform: "x" as const, platformId: statusId,
          url: `https://x.com/i/status/${statusId}`, canonicalUrl: `https://x.com/i/status/${statusId}`,
          title: text.slice(0, 120) || `Tweet ${statusId}`, description: text,
          creatorName: String(user.name ?? user.screen_name ?? ""),
          creatorId: user.screen_name ? String(user.screen_name) : undefined,
          creatorUrl: user.screen_name ? `https://x.com/${user.screen_name}` : undefined,
          publishedAt: tweet.created_at ? String(tweet.created_at) : undefined,
          likeCount: num(tweet.likes ?? tweet.favorite_count), commentCount: num(tweet.replies ?? tweet.reply_count),
          shareCount: num(tweet.retweets ?? tweet.retweet_count), viewCount: num(tweet.views ?? tweet.view_count),
          tags: [], chapters: [], thumbnailUrl: thumb,
          extra: { via: url, contentKind: kind, photos: photos.length, videos: videos.length },
        },
      };
    } catch { continue; }
  }
  return null;
}

async function tryOembed(statusId: string): Promise<VideoMetadata | null> {
  try {
    const target = encodeURIComponent(`https://twitter.com/i/status/${statusId}`);
    const res = await fetch(`https://publish.twitter.com/oembed?url=${target}&omit_script=1`, { headers: { "User-Agent": BROWSER_UA }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { author_name?: string; author_url?: string; html?: string };
    const text = (data.html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return {
      platform: "x", platformId: statusId,
      url: `https://x.com/i/status/${statusId}`, canonicalUrl: `https://x.com/i/status/${statusId}`,
      title: text.slice(0, 120) || `Tweet ${statusId}`, description: text,
      creatorName: data.author_name ?? "", creatorUrl: data.author_url, tags: [], chapters: [], extra: { via: "oembed" },
    };
  } catch { return null; }
}
function num(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}
function unique(arr: string[]): string[] { return [...new Set(arr)]; }
