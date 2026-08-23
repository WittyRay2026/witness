import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { hasFfmpeg, runCommand } from "./exec";
import type { KeyFrame, ReadLevel } from "./types";
import { LEVEL_META } from "./types";

export interface ScenePlan { frames: KeyFrame[]; notes: string[]; method: string; }
export function frameBudget(level: ReadLevel, durationSec?: number) {
  const max = LEVEL_META[level].visionMax;
  if (max === 0) return { min: 0, max: 0 };
  const d = durationSec ?? 180;
  const target = Math.round(Math.min(max, Math.max(4, d / 35)));
  return { min: Math.min(4, target), max };
}
export async function extractKeyframes(opts: {
  videoPath?: string; previewUrls?: string[]; shotPaths?: string[]; thumbnailUrl?: string;
  durationSec?: number; level: ReadLevel; outDir: string; videoId: string;
}): Promise<ScenePlan> {
  const notes: string[] = [];
  const { max } = frameBudget(opts.level, opts.durationSec);
  if (max === 0) return { frames: [], notes: ["Fast 模式不提取关键帧。"], method: "none" };
  mkdirSync(opts.outDir, { recursive: true });
  if (opts.videoPath && hasFfmpeg() && existsSync(opts.videoPath)) {
    const scene = await sceneDetect(opts.videoPath, opts.outDir, max);
    notes.push(...scene.notes);
    const intervalCount = Math.min(max, Math.max(4, Math.round((opts.durationSec ?? 60) / 20)));
    const interval = await intervalSample(opts.videoPath, opts.outDir, intervalCount, opts.durationSec);
    notes.push(...interval.notes);
    const merged = coverTimeline([...scene.frames, ...interval.frames], opts.durationSec, max);
    notes.push(`时间轴覆盖后保留 ${merged.length} 帧。`);
    return { frames: merged, notes, method: "ffmpeg-scene+interval" };
  }
  if (opts.shotPaths?.length) {
    const duration = opts.durationSec ?? opts.shotPaths.length * 8;
    const frames: KeyFrame[] = opts.shotPaths.slice(0, max).map((p, i) => ({
      id: `shot-${i}`, t: Math.round((i + 0.5) * (duration / Math.max(1, opts.shotPaths!.length))),
      path: p, url: publicFrameUrl(p), reason: "interval" as const,
    }));
    notes.push(`使用 B 站官方 videoshot ${frames.length} 张全片采样。`);
    return { frames, notes, method: "bilibili-videoshot" };
  }
  notes.push("没有可用视频文件，退回平台预览帧。");
  const remote = await downloadPreviewFrames([...(opts.previewUrls ?? []), opts.thumbnailUrl].filter((u): u is string => Boolean(u)), opts.outDir, opts.videoId);
  if (remote.length) notes.push(`获得 ${remote.length} 张平台预览帧。`);
  return { frames: remote.slice(0, Math.min(4, max)), notes, method: "platform-preview" };
}
async function sceneDetect(videoPath: string, outDir: string, max: number): Promise<ScenePlan> {
  const notes: string[] = [];
  let threshold = 0.38; let files: string[] = []; let times: number[] = [];
  for (const t of [0.38, 0.28, 0.2]) {
    threshold = t;
    const prefix = path.join(outDir, `sc_${String(t).replace(".", "")}_`);
    const result = await runCommand("ffmpeg", ["-hide_banner", "-y", "-i", videoPath, "-vf", `select='gt(scene,${t})',showinfo,scale=640:-2`, "-fps_mode", "vfr", `${prefix}%03d.jpg`], { timeoutMs: 180_000 });
    files = readdirSync(outDir).filter((f) => f.startsWith(path.basename(prefix)) && f.endsWith(".jpg")).sort();
    times = [...result.stderr.matchAll(/pts_time:\s*([0-9.]+)/g)].map((m) => Number(m[1]));
    if (files.length >= 4 || files.length >= max) break;
  }
  notes.push(`ffmpeg scene filter（阈值 ${threshold}）得到 ${files.length} 个镜头边界帧。`);
  return { frames: await filesToFrames(outDir, files, "scene", 0, times), notes, method: "ffmpeg-scene" };
}
async function intervalSample(videoPath: string, outDir: string, count: number, durationSec?: number): Promise<ScenePlan> {
  const dur = durationSec && durationSec > 0 ? durationSec : 60;
  const fps = Math.max(dur / Math.max(count, 1), 4);
  await runCommand("ffmpeg", ["-hide_banner", "-y", "-i", videoPath, "-vf", `fps=1/${fps.toFixed(2)},scale=640:-2`, path.join(outDir, "iv_%03d.jpg")], { timeoutMs: 180_000 });
  const files = readdirSync(outDir).filter((f) => f.startsWith("iv_") && f.endsWith(".jpg"));
  return { frames: await filesToFrames(outDir, files, "interval", fps), notes: [`间隔采样约每 ${fps.toFixed(1)}s 一帧。`], method: "interval" };
}
async function filesToFrames(dir: string, files: string[], reason: KeyFrame["reason"], intervalSec = 0, times: number[] = []): Promise<KeyFrame[]> {
  const sorted = files.map((f) => ({ f, n: Number((f.match(/(\d+)\.jpg$/) ?? [])[1] ?? 0) })).sort((a, b) => a.n - b.n);
  const out: KeyFrame[] = [];
  for (const { f, n } of sorted) {
    const full = path.join(dir, f);
    if (!existsSync(full) || statSync(full).size < 800) continue;
    const buf = await readFile(full);
    const hash = createHash("md5").update(buf.subarray(0, 4096)).digest("hex").slice(0, 12);
    out.push({
      id: `${reason}-${n}-${hash}`,
      t: times[n - 1] != null ? times[n - 1] : reason === "interval" && intervalSec ? (n - 1) * intervalSec : estimateTimeFromName(f),
      path: full, url: publicFrameUrl(full), reason,
    });
  }
  return out;
}
function estimateTimeFromName(name: string): number {
  return Math.max(0, (Number((name.match(/(\d+)\.jpg$/) ?? [])[1] ?? 0) - 1) * 4);
}
function coverTimeline(frames: KeyFrame[], durationSec: number | undefined, max: number): KeyFrame[] {
  const uniq = dedupeFrames(frames);
  if (uniq.length <= max) return uniq;
  const duration = durationSec && durationSec > 0 ? durationSec : Math.max(...uniq.map((f) => f.t), 1);
  const picked: KeyFrame[] = [];
  for (let i = 0; i < max; i++) {
    const start = (i / max) * duration; const end = ((i + 1) / max) * duration;
    const inBin = uniq.filter((f) => f.t >= start && f.t < end);
    if (!inBin.length) continue;
    picked.push(inBin.find((f) => f.reason === "scene") ?? inBin[Math.floor(inBin.length / 2)]);
  }
  for (const f of uniq) { if (picked.length >= max) break; if (!picked.some((p) => p.id === f.id)) picked.push(f); }
  return picked.sort((a, b) => a.t - b.t).slice(0, max);
}
function dedupeFrames(frames: KeyFrame[]): KeyFrame[] {
  const seen = new Set<string>(); const out: KeyFrame[] = [];
  for (const f of frames) { const key = f.id.split("-").pop() ?? f.id; if (seen.has(key)) continue; seen.add(key); out.push(f); }
  return out.sort((a, b) => a.t - b.t);
}
async function downloadPreviewFrames(urls: string[], outDir: string, _videoId: string): Promise<KeyFrame[]> {
  const frames: KeyFrame[] = []; let i = 0;
  for (const url of urls) {
    i += 1;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1500) continue;
      const dest = path.join(outDir, `prev_${String(i).padStart(2, "0")}.jpg`);
      writeFileSync(dest, buf);
      frames.push({ id: `preview-${i}`, t: 0, path: dest, url: publicFrameUrl(dest), reason: i === urls.length ? "thumbnail" : "preview" });
    } catch {}
  }
  return frames;
}
export function publicFrameUrl(fullPath: string): string {
  const marker = `${path.sep}media${path.sep}`;
  const idx = fullPath.lastIndexOf(marker);
  const rel = idx >= 0 ? fullPath.slice(idx + marker.length) : path.basename(fullPath);
  return `/api/media?p=${encodeURIComponent(rel.split(path.sep).join("/"))}`;
}
