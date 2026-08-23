import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { EvidenceBoard } from "@/components/evidence-board";
import { askVideo, getJobState, getVideoState } from "@/lib/reader/actions";
import { rememberGuestLibrary } from "@/lib/reader/library-local";
import { LEVEL_META, type JobRecord, type VideoRecord } from "@/lib/reader/types";
import { formatClock } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/watch/$id")({
  validateSearch: (s: Record<string, unknown>) => ({ job: typeof s.job === "string" ? s.job : undefined }),
  loader: async ({ params }) => {
    try { return { video: await getVideoState({ data: params.id }) }; }
    catch { return { video: null as VideoRecord | null }; }
  },
  component: WatchPage,
});

function WatchPage() {
  const { id } = Route.useParams();
  const { job: jobId } = Route.useSearch();
  const loaded = Route.useLoaderData();
  const [video, setVideo] = useState<VideoRecord | null>(loaded.video ?? null);
  const [job, setJob] = useState<JobRecord | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const v = await getVideoState({ data: id });
        if (!stop) { setVideo(v); if (v?.id) rememberGuestLibrary(v.id); }
        if (jobId && jobId !== "cached") {
          const j = await getJobState({ data: jobId });
          if (!stop) setJob(j);
          if (j && (j.status === "running" || j.status === "queued")) { window.setTimeout(tick, 1400); return; }
        }
        if (v && (v.status === "running" || v.status === "queued")) window.setTimeout(tick, 1400);
      } catch { if (!stop) window.setTimeout(tick, 2000); }
    };
    void tick();
    return () => { stop = true; };
  }, [id, jobId]);
  const r = video?.representation;
  const running = video?.status === "running" || video?.status === "queued" || job?.status === "running";
  return (
    <Shell>
      <p className="font-mono text-[11px] text-faint">{id}</p>
      <h1 className="mt-1 font-display text-3xl tracking-tight">{video?.title || "正在读取…"}</h1>
      <p className="mt-1 text-sm text-muted">{video?.creatorName}{video?.durationSec ? ` · ${formatClock(video.durationSec)}` : ""}{video?.level ? ` · ${LEVEL_META[video.level]?.label}` : ""} · <Link to="/">新的链接</Link></p>
      {running && (
        <div className="mt-6 rounded-lg border border-border bg-surface p-4">
          <p className="text-sm">{job?.stage ?? video?.status} · {job?.progress ?? 0}%</p>
          <ol className="mt-3 max-h-40 space-y-1 overflow-auto font-mono text-[11px] text-muted">{(job?.log ?? []).slice(-8).map((line) => <li key={line.t + line.message}>{line.message}</li>)}</ol>
        </div>
      )}
      {video?.error && <p className="mt-4 text-sm text-bad">{video.error}</p>}
      {r && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4">
            {r.visualNeeded && <p className="text-sm text-info">仅字幕不足以理解本视频。{r.visualNeededReason}</p>}
            {r.warnings.map((w) => <p key={w} className="text-sm text-warn">{w}</p>)}
            <section className="rounded-lg border border-border bg-surface p-5">
              <h2 className="font-display text-xl">摘要</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted">{r.summary || "尚无摘要。"}</p>
            </section>
            <section>
              <h2 className="font-display text-xl">时间轴</h2>
              <div className="mt-3 space-y-3">
                {r.timeline.map((seg) => (
                  <article key={`${seg.start}-${seg.end}`} className="rounded-lg border border-border bg-surface p-4">
                    <p className="font-mono text-xs text-faint">{formatClock(seg.start)}–{formatClock(seg.end)}</p>
                    <p className="mt-2 text-sm">音频 {seg.audio}</p>
                    <p className="mt-1 text-sm">视觉 {seg.visual}</p>
                    <p className="mt-2 text-sm text-muted">{seg.explanation}</p>
                  </article>
                ))}
                {r.timeline.length === 0 && <p className="text-sm text-muted">还没有融合时间轴。</p>}
              </div>
            </section>
          </div>
          <aside className="space-y-4">
            <EvidenceBoard board={r.evidence} />
            <form onSubmit={async (e) => { e.preventDefault(); if (!question.trim()) return; setAsking(true); try { setAnswer((await askVideo({ data: { videoId: id, question } })).text); } catch (err) { toast.error(err instanceof Error ? err.message : "提问失败"); } finally { setAsking(false); } }} className="rounded-lg border border-border bg-surface p-4">
              <label className="text-sm font-medium">基于表示提问</label>
              <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} className="mt-2 w-full rounded-md border border-border bg-bg p-2 text-sm" />
              <button type="submit" disabled={asking} className="mt-2 h-9 w-full rounded-md bg-accent text-sm text-accent-fg">{asking ? "…" : "提问"}</button>
              {answer && <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{answer}</p>}
            </form>
          </aside>
        </div>
      )}
    </Shell>
  );
}
