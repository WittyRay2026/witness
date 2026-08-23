import type { CaptionCue, Claim, KeyFrame, TimelineSegment, VideoMetadata } from "./types";
import { chatJson } from "./xai";
import { transcriptPlain } from "./captions";

export async function fuseTimeline(opts: {
  metadata: VideoMetadata;
  cues: CaptionCue[];
  frames: KeyFrame[];
}): Promise<{ timeline: TimelineSegment[]; summary: string; people: string[]; organizations: string[]; concepts: string[] }> {
  const duration = opts.metadata.durationSec ?? opts.cues.at(-1)?.end ?? 0;
  const frameBrief = opts.frames.map((f) => ({
    id: f.id, t: Math.round(f.t), reason: f.reason, what: f.analysis?.what,
    text: f.analysis?.onScreenText, charts: f.analysis?.charts, ui: f.analysis?.ui,
    sources: f.analysis?.sources, important: f.analysis?.visualImportance,
  }));
  try {
    const result = await chatJson<{
      summary: string; people: string[]; organizations: string[]; concepts: string[];
      timeline: { start: number; end: number; audio: string; visual: string; ocr: string[]; sources: string[]; explanation: string; transcript: string; keyframeIds: string[] }[];
    }>([
      {
        role: "system",
        content: opts.metadata.platform === "x"
          ? "Fuse a tweet's text with any photos or video frames. Do not pretend there is a video. Write in the tweet's language."
          : "Fuse audio/subtitles with visual evidence. Never invent unseen frames. Write in the video's language.",
      },
      {
        role: "user",
        content: `Title: ${opts.metadata.title}\nCreator: ${opts.metadata.creatorName}\nDuration: ${duration}s\nChapters: ${JSON.stringify(opts.metadata.chapters).slice(0, 2000)}\nTRANSCRIPT:\n${transcriptPlain(opts.cues, 24000)}\nKEYFRAMES:\n${JSON.stringify(frameBrief).slice(0, 12000)}\nReturn JSON with summary, people, organizations, concepts, timeline (6-18 segments).`,
      },
    ], { maxTokens: 3500 });
    const timeline = (result.timeline ?? []).map((s) => ({
      start: Number(s.start) || 0, end: Number(s.end) || 0, audio: s.audio ?? "",
      visual: s.visual ?? "无视觉证据", ocr: s.ocr ?? [], sources: s.sources ?? [],
      explanation: s.explanation ?? "", transcript: s.transcript ?? "", keyframeIds: s.keyframeIds ?? [],
    }));
    return {
      timeline: timeline.length ? timeline : fallbackTimeline(opts.cues, opts.frames, duration),
      summary: result.summary ?? "", people: result.people ?? [], organizations: result.organizations ?? [], concepts: result.concepts ?? [],
    };
  } catch {
    return { timeline: fallbackTimeline(opts.cues, opts.frames, duration), summary: opts.cues.map((c) => c.text).join(" ").slice(0, 800), people: [], organizations: [], concepts: [] };
  }
}

function fallbackTimeline(cues: CaptionCue[], frames: KeyFrame[], duration: number): TimelineSegment[] {
  const span = 90; const out: TimelineSegment[] = [];
  const total = Math.max(duration, cues.at(-1)?.end ?? 0, 30);
  for (let t = 0; t < total; t += span) {
    const end = Math.min(total, t + span);
    const slice = cues.filter((c) => c.start < end && c.end > t);
    const vis = frames.filter((f) => f.t >= t && f.t < end);
    out.push({
      start: t, end,
      audio: slice.map((c) => c.text).join(" ").slice(0, 600) || "此段没有字幕/ASR。",
      visual: vis.map((f) => f.analysis?.what ?? "").filter(Boolean).join("；") || "此段没有已分析的关键帧。",
      ocr: vis.flatMap((f) => f.analysis?.onScreenText ?? []),
      sources: vis.flatMap((f) => f.analysis?.sources ?? []),
      explanation: "规则切分。",
      transcript: slice.map((c) => c.text).join(" ").slice(0, 400),
      keyframeIds: vis.map((f) => f.id),
    });
  }
  return out;
}

export async function extractClaims(opts: { title: string; creator: string; summary: string; timeline: TimelineSegment[]; transcript: string }): Promise<Claim[]> {
  try {
    const result = await chatJson<{ claims: Claim[] }>([
      { role: "system", content: "Extract claims. Do not add claims the speaker did not make." },
      { role: "user", content: `Title: ${opts.title}\nCreator: ${opts.creator}\nSummary: ${opts.summary}\nTimeline: ${JSON.stringify(opts.timeline).slice(0, 10000)}\nReturn JSON { claims: [{ id, text, kind, evidence, reasoning, assumptions, timestamps }] }` },
    ], { maxTokens: 1800 });
    return (result.claims ?? []).slice(0, 12).map((c, i) => ({
      id: c.id || `c${i + 1}`, text: c.text, kind: c.kind ?? "interpretation",
      evidence: c.evidence ?? [], reasoning: c.reasoning ?? "", assumptions: c.assumptions ?? [], timestamps: c.timestamps ?? [],
    }));
  } catch { return []; }
}
