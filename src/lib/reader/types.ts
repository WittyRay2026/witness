export const READ_LEVELS = ["fast", "standard", "deep", "research"] as const;
export type ReadLevel = (typeof READ_LEVELS)[number];
export const PLATFORMS = ["youtube", "bilibili", "x", "generic"] as const;
export type Platform = (typeof PLATFORMS)[number];
export type JobStatus = "queued" | "running" | "done" | "error" | "partial";
export type EvidenceState = "yes" | "partial" | "no" | "skipped";
export interface EvidenceBoard {
  page: EvidenceState; metadata: EvidenceState; officialCaptions: EvidenceState;
  audio: EvidenceState; asr: EvidenceState; keyframes: EvidenceState; vision: EvidenceState;
  ocr: EvidenceState; sources: EvidenceState; factCheck: EvidenceState;
  notes: string[]; keyframeCount: number; sourceCount: number; factCheckCount: number;
  captionKind?: "official" | "auto" | "ai" | "asr" | "none";
}
export interface CaptionCue { start: number; end: number; text: string; speaker?: string; }
export interface VideoMetadata {
  platform: Platform; platformId: string; url: string; canonicalUrl: string; title: string;
  description: string; creatorName: string; creatorId?: string; creatorUrl?: string;
  publishedAt?: string; durationSec?: number; tags: string[]; category?: string;
  viewCount?: number; likeCount?: number; favoriteCount?: number; shareCount?: number;
  commentCount?: number; chapters: { start: number; end?: number; title: string }[];
  thumbnailUrl?: string; pages?: { cid: string; title: string; duration?: number }[];
  extra: Record<string, string | number | boolean | null>;
}
export interface KeyFrame {
  id: string; t: number; path: string; url: string;
  reason: "scene" | "interval" | "thumbnail" | "preview"; analysis?: FrameAnalysis;
}
export interface FrameAnalysis {
  what: string; objects: string[]; people: string[]; onScreenText: string[];
  charts: string[]; tables: string[]; maps: string[]; numbers: string[]; ui: string[];
  sources: string[]; visualImportance: "low" | "medium" | "high"; subtitleInsufficient: boolean;
}
export interface TimelineSegment {
  start: number; end: number; audio: string; visual: string; ocr: string[]; sources: string[];
  explanation: string; transcript: string; keyframeIds: string[];
}
export interface Claim {
  id: string; text: string; kind: "fact" | "interpretation" | "inference" | "value" | "rhetoric";
  evidence: string[]; reasoning: string; assumptions: string[]; timestamps: number[];
}
export interface SourceHit {
  id: string; mentionedAs: string; kind: string; timestamp?: number; resolvedUrl?: string;
  resolvedTitle?: string; supportsClaim?: string; status: "found" | "partial" | "unresolved";
}
export interface FactCheck {
  id: string; claim: string; verdict: "supported" | "partial" | "unsupported" | "unconfirmed";
  sourcePriority: string; sources: { title: string; url: string }[]; notes: string;
}
export interface VideoRepresentation {
  id: string; schemaVersion: 1; level: ReadLevel; metadata: VideoMetadata; evidence: EvidenceBoard;
  chapters: VideoMetadata["chapters"]; transcript: CaptionCue[]; timeline: TimelineSegment[];
  claims: Claim[]; people: string[]; organizations: string[]; concepts: string[];
  sources: SourceHit[]; factChecks: FactCheck[]; keyframes: KeyFrame[]; summary: string;
  visualNeeded: boolean; visualNeededReason?: string; warnings: string[];
}
export interface JobLogLine { t: number; stage: string; message: string; }
export interface JobRecord {
  id: string; videoId: string; userId: string; level: ReadLevel; status: JobStatus;
  stage: string; progress: number; log: JobLogLine[]; error?: string;
}
export interface VideoRecord {
  id: string; userId: string; platform: Platform; platformId: string; url: string;
  canonicalUrl?: string; title?: string; creatorName?: string; durationSec?: number | null;
  level: ReadLevel; status: JobStatus; evidence: EvidenceBoard; metadata?: VideoMetadata | null;
  representation?: VideoRepresentation | null; error?: string | null; createdAt: string; updatedAt: string;
}
export interface ParsedVideoUrl {
  platform: Platform; platformId: string; url: string; canonicalUrl: string; extra?: Record<string, string>;
}
export const EMPTY_EVIDENCE: EvidenceBoard = {
  page: "no", metadata: "no", officialCaptions: "no", audio: "no", asr: "skipped",
  keyframes: "no", vision: "skipped", ocr: "skipped", sources: "skipped", factCheck: "skipped",
  notes: [], keyframeCount: 0, sourceCount: 0, factCheckCount: 0, captionKind: "none",
};
export const LEVEL_META: Record<ReadLevel, { label: string; command: string; blurb: string; visionMax: number }> = {
  fast: { label: "快速", command: "只读字幕", blurb: "只读页面资料和官方字幕。", visionMax: 0 },
  standard: { label: "标准", command: "看画面", blurb: "字幕或语音转写，加上关键帧。", visionMax: 12 },
  deep: { label: "深度", command: "抽论点", blurb: "完整多模态时间轴。", visionMax: 28 },
  research: { label: "核查", command: "外部核验", blurb: "深度读取后核验事实。", visionMax: 40 },
};
