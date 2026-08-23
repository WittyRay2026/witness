import { createServerFn } from "@tanstack/react-start";
import { getSessionUser } from "@/lib/auth/verify.server";
import { READ_LEVELS, type ReadLevel, type VideoRepresentation } from "./types";
import { startRead } from "./pipeline";
import { addLibraryEntry, getJob, getVideo, getVideosByIds, listVideos } from "./store";
import { chatText } from "./xai";
import { transcriptPlain } from "./captions";
import { listCreatorVideos } from "./bilibili";
import { parseVideoUrl } from "./url";

async function actorId(): Promise<string> {
  try { return (await getSessionUser())?.id ?? "guest"; } catch { return "guest"; }
}
export const startVideoRead = createServerFn({ method: "POST" })
  .validator((input: { url: string; level: ReadLevel; force?: boolean }) => {
    if (!input?.url?.trim()) throw new Error("请输入链接");
    if (!READ_LEVELS.includes(input.level)) throw new Error("未知读取级别");
    return input;
  })
  .handler(async ({ data }) => startRead({ url: data.url.trim(), level: data.level, userId: await actorId(), force: data.force }));
export const getVideoState = createServerFn({ method: "GET" }).validator((id: string) => id).handler(async ({ data: id }) => getVideo(id));
export const getJobState = createServerFn({ method: "GET" }).validator((id: string) => id).handler(async ({ data: id }) => getJob(id));
export const listLibrary = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await actorId();
  return { userId, signedIn: userId !== "guest", videos: await listVideos(userId) };
});
export const loadVideosByIds = createServerFn({ method: "POST" })
  .validator((ids: string[]) => ids.filter((id) => typeof id === "string").slice(0, 40))
  .handler(async ({ data: ids }) => getVideosByIds(ids));
export const pinLibrary = createServerFn({ method: "POST" })
  .validator((ids: string[]) => ids.filter((id) => typeof id === "string").slice(0, 40))
  .handler(async ({ data: ids }) => {
    const userId = await actorId();
    if (userId === "guest") return { ok: false as const };
    for (const id of ids) await addLibraryEntry(userId, id);
    return { ok: true as const };
  });
export const askVideo = createServerFn({ method: "POST" })
  .validator((input: { videoId: string; question: string }) => input)
  .handler(async ({ data }) => {
    const video = await getVideo(data.videoId);
    if (!video?.representation) throw new Error("还没有可提问的视频表示");
    const r = video.representation;
    const packet = buildPacket(r);
    const text = await chatText([
      { role: "system", content: "你只能根据附带的视频表示来回答。必须说明证据层级，并引用时间戳。表示里没有画面或音频时，直接说没有，不要假装看过。默认用中文回答。" },
      { role: "user", content: `${packet}\n\nQUESTION:\n${data.question}` },
    ], { maxTokens: 1600 });
    return { text };
  });
export const searchInVideo = createServerFn({ method: "POST" })
  .validator((input: { videoId: string; query: string }) => input)
  .handler(async ({ data }) => {
    const r = (await getVideo(data.videoId))?.representation;
    if (!r) return { hits: [] as { t: number; kind: string; text: string }[] };
    const q = data.query.trim().toLowerCase();
    const hits: { t: number; kind: string; text: string }[] = [];
    for (const c of r.transcript) if (c.text.toLowerCase().includes(q)) hits.push({ t: c.start, kind: "audio", text: c.text });
    for (const f of r.keyframes) {
      const blob = [f.analysis?.what, ...(f.analysis?.onScreenText ?? []), ...(f.analysis?.charts ?? [])].join(" ").toLowerCase();
      if (blob.includes(q)) hits.push({ t: f.t, kind: "visual", text: f.analysis?.what || f.analysis?.onScreenText?.join(" ") || "" });
    }
    for (const s of r.timeline) if (`${s.audio} ${s.visual} ${s.explanation}`.toLowerCase().includes(q)) hits.push({ t: s.start, kind: "timeline", text: s.explanation || s.audio });
    return { hits: hits.slice(0, 40) };
  });
export const sampleCreator = createServerFn({ method: "POST" })
  .validator((input: { url: string }) => input)
  .handler(async ({ data }) => {
    const parsed = await parseVideoUrl(data.url);
    if (parsed.platform !== "bilibili") throw new Error("作者抽样目前先支持哔哩哩哩。");
    const { fetchBilibili } = await import("./bilibili");
    const bili = await fetchBilibili(parsed.platformId);
    if (!bili.metadata.creatorId) throw new Error("无法解析 UP 主 mid");
    const list = await listCreatorVideos(bili.metadata.creatorId, 30);
    return {
      platform: "bilibili" as const, creatorId: bili.metadata.creatorId, creatorName: bili.metadata.creatorName,
      videos: list.map((v) => ({ id: v.bvid, title: v.title, url: `https://www.bilibili.com/video/${v.bvid}`, publishedAt: v.created ? new Date(v.created * 1000).toISOString() : undefined, play: v.play, length: v.length })),
    };
  });
function buildPacket(r: VideoRepresentation): string {
  return JSON.stringify({ evidence: r.evidence, warnings: r.warnings, metadata: { title: r.metadata.title, creator: r.metadata.creatorName, duration: r.metadata.durationSec, publishedAt: r.metadata.publishedAt }, summary: r.summary, visualNeeded: r.visualNeeded, visualNeededReason: r.visualNeededReason, timeline: r.timeline, claims: r.claims, sources: r.sources, factChecks: r.factChecks, people: r.people, concepts: r.concepts, keyframes: r.keyframes.map((f) => ({ t: f.t, what: f.analysis?.what, text: f.analysis?.onScreenText, charts: f.analysis?.charts, sources: f.analysis?.sources })), transcript: transcriptPlain(r.transcript, 10_000) }, null, 0).slice(0, 70_000);
}
