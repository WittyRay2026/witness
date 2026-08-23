import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { mediaDir, ytDlpDownload, hasYtDlp, hasFfmpeg, runCommand, which } from "./exec";
import type { Platform } from "./types";
import { youtubeMediaHint } from "./youtube";

export interface MediaFiles {
  videoPath?: string;
  audioPath?: string;
  notes: string[];
}

export async function acquireMedia(
  platform: Platform,
  platformId: string,
  url: string,
  extraUrls: string[] = [],
): Promise<MediaFiles> {
  const dir = mediaDir(platform, platformId);
  const notes: string[] = [];
  const existingVideo = firstExisting([path.join(dir, "video.mp4"), path.join(dir, "video.mkv"), path.join(dir, "video.webm")]);
  const existingAudio = firstExisting([path.join(dir, "audio.mp3"), path.join(dir, "audio.m4a"), path.join(dir, "audio.webm")]);
  if (existingVideo || existingAudio) return { videoPath: existingVideo, audioPath: existingAudio, notes: ["使用已缓存的媒体文件。"] };
  if (!hasYtDlp()) {
    notes.push("环境没有 yt-dlp。");
    for (const direct of extraUrls.slice(0, 3)) {
      try {
        const dest = path.join(dir, "direct.mp4");
        const got = await fetch(direct, { headers: { "User-Agent": "Mozilla/5.0", Referer: url }, signal: AbortSignal.timeout(60_000) });
        if (!got.ok) continue;
        const buf = Buffer.from(await got.arrayBuffer());
        if (buf.length < 64 || buf.length > 80_000_000) continue;
        const { writeFileSync } = await import("node:fs");
        writeFileSync(dest, buf);
        notes.push("已使用页面中的直接媒体地址。");
        return { videoPath: dest, notes };
      } catch {}
    }
    return { notes };
  }
  const videoOut = path.join(dir, "video.%(ext)s");
  const format = platform === "bilibili"
    ? "30016+30216/30032+30216/bestvideo[height<=480]+bestaudio/best[height<=480]/best"
    : "best[height<=360][ext=mp4]/18/bestvideo[height<=360]+bestaudio/bestaudio/best";
  const res = await ytDlpDownload(url, videoOut, ["-f", format, "--merge-output-format", "mp4", "--max-filesize", "250M"], platform === "bilibili" ? 300_000 : 180_000);
  if (res.code !== 0) {
    const hint = platform === "youtube" ? youtubeMediaHint(res.stderr) : res.stderr.slice(0, 280);
    notes.push(`视频下载失败：${hint}`);
    const audioRes = await ytDlpDownload(url, path.join(dir, "audio.%(ext)s"), ["-f", "bestaudio/best", "-x", "--audio-format", "mp3", "--audio-quality", "7", "--max-filesize", "80M"]);
    if (audioRes.code === 0) {
      const audioPath = findByPrefix(dir, "audio.");
      if (audioPath) return { audioPath, notes };
    }
    return { notes };
  }
  const videoPath = findByPrefix(dir, "video.");
  let audioPath: string | undefined;
  if (videoPath && hasFfmpeg()) {
    const dest = path.join(dir, "audio.mp3");
    const r = await runCommand("ffmpeg", ["-y", "-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-q:a", "7", dest], { timeoutMs: 180_000 });
    if (r.code === 0 && existsSync(dest)) audioPath = dest;
  }
  return { videoPath, audioPath, notes };
}
function firstExisting(paths: string[]): string | undefined { return paths.find((p) => existsSync(p)); }
function findByPrefix(dir: string, prefix: string): string | undefined {
  return readdirSync(dir).filter((f) => f.startsWith(prefix) && !f.includes("%")).map((f) => path.join(dir, f)).find((p) => existsSync(p));
}
