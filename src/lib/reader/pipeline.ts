import path from "node:path";
import type { CaptionCue, Claim, EvidenceBoard, FactCheck, JobRecord, KeyFrame, ReadLevel, SourceHit, VideoRepresentation } from "./types";
import { EMPTY_EVIDENCE, LEVEL_META } from "./types";
import { parseVideoUrl, videoCacheId } from "./url";
import { fetchYouTube } from "./youtube";
import { fetchBilibili, acquireBilibiliMedia } from "./bilibili";
import { fetchX } from "./twitter";
import { acquireMedia } from "./media";
import { extractKeyframes } from "./scenes";
import { runAsr } from "./asr";
import { analyzeKeyframes, detectVisualNeed } from "./vision";
import { extractClaims, fuseTimeline } from "./fusion";
import { resolveSources, verifyClaims } from "./factcheck";
import { captionQuality, transcriptPlain } from "./captions";
import { mediaDir, hasFfmpeg, hasYtDlp } from "./exec";
import { xaiKey } from "./xai";
import { addLibraryEntry, getVideo, insertJob, updateJob, upsertVideo } from "./store";
import { shortId } from "@/lib/utils";

const running = new Map<string, Promise<void>>();

export async function startRead(opts: { url: string; level: ReadLevel; userId: string; force?: boolean }) {
  const parsed = await parseVideoUrl(opts.url);
  const videoId = videoCacheId(parsed.platform, parsed.platformId);
  const existing = await getVideo(videoId);
  const haveDeeper = existing?.representation && rank(existing.level) >= rank(opts.level) && (existing.status === "done" || existing.status === "partial") && !opts.force && !isHollowRead(existing.representation);
  if (haveDeeper && existing) {
    await addLibraryEntry(opts.userId, videoId);
    return { videoId, jobId: "cached", reused: true as const };
  }
  const jobId = shortId();
  await upsertVideo({ id: videoId, userId: opts.userId, platform: parsed.platform, platformId: parsed.platformId, url: parsed.url, canonicalUrl: parsed.canonicalUrl, level: opts.level, status: "queued", evidence: { ...EMPTY_EVIDENCE } });
  await addLibraryEntry(opts.userId, videoId);
  const job: JobRecord = { id: jobId, videoId, userId: opts.userId, level: opts.level, status: "queued", stage: "queued", progress: 1, log: [{ t: Date.now(), stage: "queued", message: `已排队 ${parsed.platform}:${parsed.platformId}` }] };
  await insertJob(job);
  const task = runPipeline({ ...opts, parsed, videoId, jobId }).catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err);
    await updateJob(jobId, { status: "error", stage: "error", error: message, progress: 100 });
    await upsertVideo({ id: videoId, userId: opts.userId, platform: parsed.platform, platformId: parsed.platformId, url: parsed.url, canonicalUrl: parsed.canonicalUrl, level: opts.level, status: "error", error: message });
  });
  running.set(jobId, task);
  void task.finally(() => running.delete(jobId));
  return { videoId, jobId, reused: false as const };
}

function rank(level: ReadLevel): number { return { fast: 1, standard: 2, deep: 3, research: 4 }[level]; }
function isHollowRead(r: VideoRepresentation): boolean {
  if (r.metadata.platform === "x" && (r.metadata.description || "").trim().length > 8) return false;
  const joined = [...r.warnings, ...r.evidence.notes].join(" ");
  const noMedia = r.evidence.audio !== "yes" && r.evidence.asr !== "yes";
  return noMedia && (joined.includes("yt-dlp") || joined.includes("无法下载") || joined.includes("没有音轨"));
}

async function runPipeline(opts: { url: string; level: ReadLevel; userId: string; parsed: Awaited<ReturnType<typeof parseVideoUrl>>; videoId: string; jobId: string }) {
  const { parsed, level, userId, videoId, jobId } = opts;
  const log = async (stage: string, message: string, progress: number) => {
    const job = await import("./store").then((m) => m.getJob(jobId));
    await updateJob(jobId, { status: "running", stage, progress, log: [...(job?.log ?? []), { t: Date.now(), stage, message }] });
  };
  await log("route", `识别为 ${parsed.platform} / ${parsed.platformId}`, 8);
  const evidence: EvidenceBoard = { ...EMPTY_EVIDENCE, notes: [] };
  const warnings: string[] = [];
  let metadata; let cues: CaptionCue[] = []; let captionKind: EvidenceBoard["captionKind"] = "none";
  let extraMedia: string[] = []; let previewUrls: string[] = [];
  if (parsed.platform === "youtube") {
    const yt = await fetchYouTube(parsed.platformId);
    metadata = yt.metadata; cues = yt.captions; captionKind = yt.captionKind === "none" ? "none" : yt.captionKind; previewUrls = yt.storyboardHints;
    evidence.page = "yes"; evidence.metadata = metadata.title ? "yes" : "partial";
  } else if (parsed.platform === "bilibili") {
    const bili = await fetchBilibili(parsed.platformId);
    metadata = bili.metadata; cues = bili.captions; captionKind = bili.captionKind === "none" ? "none" : bili.captionKind === "ai" ? "ai" : "official";
    evidence.page = "yes"; evidence.metadata = metadata.title ? "yes" : "partial";
    if (metadata.thumbnailUrl) previewUrls = [metadata.thumbnailUrl];
  } else if (parsed.platform === "x") {
    const x = await fetchX(parsed.platformId);
    metadata = x.metadata; extraMedia = x.mediaUrls;
    evidence.page = metadata.description || metadata.creatorName ? "yes" : "partial";
    evidence.metadata = metadata.creatorName || metadata.description ? "yes" : "partial";
    evidence.notes.push(...x.notes);
    metadata.extra = { ...metadata.extra, contentKind: x.kind };
    if (x.kind === "photos") { previewUrls = x.photoUrls.length ? x.photoUrls : metadata.thumbnailUrl ? [metadata.thumbnailUrl] : []; warnings.push("这是图片推文，不是视频。"); }
    else if (x.kind === "text") warnings.push("这是纯文字推文，没有视频可看。");
    else if (x.loginLikely) warnings.push("X 可能要求登录才能获取完整媒体。");
    if (!previewUrls.length && metadata.thumbnailUrl) previewUrls = [metadata.thumbnailUrl];
    if (metadata.description?.trim()) cues = [{ start: 0, end: metadata.durationSec || 1, text: metadata.description.trim() }];
  } else {
    throw new Error("暂不支持该平台。");
  }
  evidence.officialCaptions = cues.length ? (parsed.platform === "x" ? "skipped" : captionKind === "official" ? "yes" : "partial") : (parsed.platform === "x" ? "skipped" : "no");
  evidence.captionKind = parsed.platform === "x" ? "none" : captionKind;
  if (parsed.platform === "x" && cues.length) evidence.notes.push("文本层来自推文正文，不是视频字幕。");
  if (captionKind === "ai") { warnings.push("字幕来自平台 AI 字幕。"); evidence.notes.push("字幕来源：Bilibili AI / 自动字幕。"); }
  if (captionKind === "auto") warnings.push("字幕来自 YouTube 自动字幕。");
  await upsertVideo({ id: videoId, userId, platform: parsed.platform, platformId: parsed.platformId, url: parsed.url, canonicalUrl: metadata.canonicalUrl, title: metadata.title, creatorName: metadata.creatorName, durationSec: metadata.durationSec, level, status: "running", evidence, metadata });
  await log("metadata", `《${metadata.title || "未命名"}》 · ${metadata.creatorName || "未知作者"}`, 18);
  const contentKind = String(metadata.extra.contentKind ?? (parsed.platform === "x" ? "unknown" : "video"));
  const isVideoPost = parsed.platform !== "x" || contentKind === "video" || extraMedia.length > 0;
  const quality = captionQuality(cues);
  const wantMedia = isVideoPost && (level !== "fast" || quality !== "good");
  const dir = mediaDir(parsed.platform, parsed.platformId);
  let audioPath: string | undefined; let videoPath: string | undefined; let shotPaths: string[] = [];
  if (wantMedia && level !== "fast") {
    await log("media", "正在获取音视频…", 28);
    if (parsed.platform === "bilibili") {
      const native = await acquireBilibiliMedia(metadata);
      audioPath = native.audioPath; videoPath = native.videoPath; shotPaths = native.shotUrls; evidence.notes.push(...native.notes);
    }
    if (!audioPath && !videoPath) {
      if (hasYtDlp() || extraMedia.length) {
        const media = await acquireMedia(parsed.platform, parsed.platformId, metadata.canonicalUrl, extraMedia);
        audioPath = media.audioPath; videoPath = media.videoPath; evidence.notes.push(...media.notes);
      } else if (parsed.platform !== "bilibili") {
        warnings.push("当前环境没有 yt-dlp。"); evidence.notes.push("yt-dlp 不可用。");
      }
    }
    evidence.audio = audioPath || videoPath ? "yes" : "no";
    if (!videoPath && !audioPath) warnings.push("未能下载音视频。不要假装看过视频。");
  } else if (!isVideoPost) {
    evidence.audio = "skipped"; evidence.notes.push(contentKind === "photos" ? "图片推文：跳过音视频下载。" : "非视频帖：跳过音视频下载。");
  } else {
    evidence.audio = "skipped"; evidence.notes.push("Fast 模式跳过媒体下载。");
  }
  if (quality === "good") { evidence.asr = "skipped"; evidence.notes.push("字幕质量足够，跳过 ASR。"); }
  else if (audioPath && xaiKey() && level !== "fast") {
    await log("asr", "官方字幕不足，启动 ASR…", 42);
    try {
      const asr = await runAsr(audioPath, dir);
      if (asr.cues.length) { cues = asr.cues; captionKind = "asr"; evidence.asr = "yes"; evidence.captionKind = "asr"; evidence.officialCaptions = evidence.officialCaptions === "yes" ? "yes" : "no"; await log("asr", `ASR 完成 ${asr.cues.length} 段`, 50); }
      else evidence.asr = "partial";
    } catch (err) { evidence.asr = "no"; warnings.push(`ASR 失败：${err instanceof Error ? err.message : String(err)}`); }
  } else if (level === "fast") { evidence.asr = "skipped"; warnings.push("Fast 模式且没有完整字幕。"); }
  else if (!isVideoPost) { evidence.asr = "skipped"; evidence.notes.push("非视频帖，不启动语音转写。"); }
  else { evidence.asr = "no"; warnings.push("没有字幕，也没有音轨。"); }
  let frames: KeyFrame[] = [];
  if (level !== "fast") {
    if (!isVideoPost && contentKind === "text" && !previewUrls.length) {
      evidence.keyframes = "skipped"; evidence.vision = "skipped"; evidence.ocr = "skipped"; evidence.notes.push("纯文字推文，没有可分析的画面。");
    } else if (!hasFfmpeg() && !previewUrls.length && !shotPaths.length && !videoPath) {
      evidence.keyframes = "no"; warnings.push("没有 ffmpeg，无法做镜头检测。");
    } else {
      await log("scenes", "抽取关键帧…", 58);
      const plan = await extractKeyframes({ videoPath, previewUrls: shotPaths.length ? [] : previewUrls, shotPaths, thumbnailUrl: metadata.thumbnailUrl, durationSec: metadata.durationSec, level, outDir: path.join(dir, "frames"), videoId });
      frames = plan.frames;
      evidence.keyframes = frames.length ? (plan.method.startsWith("ffmpeg") ? "yes" : "partial") : "no";
      evidence.keyframeCount = frames.length; evidence.notes.push(...plan.notes);
      if (plan.method === "platform-preview") {
        if (parsed.platform === "x" && contentKind === "photos") warnings.push("画面来自推文配图。");
        else if (!(parsed.platform === "x" && contentKind !== "video")) warnings.push("关键帧来自平台预览图。");
      } else if (plan.method === "bilibili-videoshot") warnings.push("关键帧来自 B 站官方 videoshot。");
      await log("scenes", `${plan.method} → ${frames.length} 帧`, 64);
    }
  } else { evidence.keyframes = "skipped"; evidence.vision = "skipped"; }
  if (frames.length && xaiKey() && LEVEL_META[level].visionMax > 0) {
    await log("vision", `正在阅读 ${frames.length} 个关键帧…`, 70);
    frames = await analyzeKeyframes(frames, dir, { title: metadata.title, transcriptHint: transcriptPlain(cues, 1500) });
    evidence.vision = frames.some((f) => f.analysis?.what) ? "yes" : "partial";
    evidence.ocr = frames.flatMap((f) => f.analysis?.onScreenText ?? []).length ? "yes" : "partial";
  } else if (level !== "fast") {
    evidence.vision = "no";
    if (!xaiKey()) warnings.push("没有可用的视觉模型密钥。");
  }
  const visual = detectVisualNeed(frames, transcriptPlain(cues, 8000));
  if (visual.needed && level === "fast") warnings.push(`仅字幕不足以理解本视频。${visual.reason}`);
  await log("fusion", "融合时间轴…", 80);
  const fused = xaiKey() ? await fuseTimeline({ metadata, cues, frames }) : { timeline: [], summary: cues.map((c) => c.text).join(" ").slice(0, 600), people: [], organizations: [], concepts: [] };
  let claims: Claim[] = []; let sources: SourceHit[] = []; let factChecks: FactCheck[] = [];
  if (level === "deep" || level === "research") {
    await log("claims", "抽取论点…", 88);
    claims = await extractClaims({ title: metadata.title, creator: metadata.creatorName, summary: fused.summary, timeline: fused.timeline, transcript: transcriptPlain(cues, 12_000) });
    sources = await resolveSources({ framesSources: frames.flatMap((f) => f.analysis?.sources ?? []), timeline: fused.timeline, description: metadata.description });
    evidence.sources = sources.length ? "yes" : "partial"; evidence.sourceCount = sources.length;
  } else evidence.sources = "skipped";
  if (level === "research") {
    await log("verify", "核验事实…", 94);
    factChecks = await verifyClaims({ metadata, claims });
    evidence.factCheck = factChecks.length ? "yes" : "partial"; evidence.factCheckCount = factChecks.length;
  } else evidence.factCheck = "skipped";
  const status = evidence.metadata === "yes" && (cues.length || frames.length) ? "done" : "partial";
  const representation: VideoRepresentation = { id: videoId, schemaVersion: 1, level, metadata, evidence, chapters: metadata.chapters, transcript: cues, timeline: fused.timeline, claims, people: fused.people, organizations: fused.organizations, concepts: fused.concepts, sources, factChecks, keyframes: frames.map((f) => ({ ...f, path: "" })), summary: fused.summary, visualNeeded: visual.needed, visualNeededReason: visual.reason, warnings };
  await upsertVideo({ id: videoId, userId, platform: parsed.platform, platformId: parsed.platformId, url: parsed.url, canonicalUrl: metadata.canonicalUrl, title: metadata.title, creatorName: metadata.creatorName, durationSec: metadata.durationSec, level, status, evidence, metadata, representation, error: null });
  await log("done", status === "done" ? "读取完成。" : "部分完成。", 100);
  await updateJob(jobId, { status, stage: "done", progress: 100 });
}
