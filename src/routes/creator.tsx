import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Shell } from "@/components/shell";
import { sampleCreator, startVideoRead } from "@/lib/reader/actions";
import { rememberGuestLibrary } from "@/lib/reader/library-local";
import { toast } from "sonner";
export const Route = createFileRoute("/creator")({ component: CreatorPage });
function CreatorPage() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("https://www.bilibili.com/video/BV1nZb66oEpX");
  const [busy, setBusy] = useState(false);
  const [dossier, setDossier] = useState<Awaited<ReturnType<typeof sampleCreator>> | null>(null);
  async function load() {
    setBusy(true);
    try { setDossier(await sampleCreator({ data: { url } })); }
    catch (err) { toast.error(err instanceof Error ? err.message : "无法抽样"); }
    finally { setBusy(false); }
  }
  return (
    <Shell>
      <h1 className="font-display text-3xl tracking-tight">作者研究</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">贴他任意一条公开视频，先拉投稿列表，再真正读取代表作。</p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <input value={url} onChange={(e) => setUrl(e.target.value)} className="h-11 flex-1 rounded-md border border-border bg-surface px-3 text-sm" />
        <button type="button" onClick={() => void load()} disabled={busy} className="h-11 rounded-md bg-accent px-5 text-sm font-medium text-accent-fg disabled:opacity-50">{busy ? "正在拉取…" : "获取公开列表"}</button>
      </div>
      {dossier && (
        <section className="mt-8">
          <h2 className="font-display text-2xl">{dossier.creatorName}</h2>
          <ul className="mt-4 divide-y divide-line rounded-lg border border-border bg-surface">
            {dossier.videos.map((v) => (
              <li key={v.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-sm">{v.title}</p><p className="text-[11px] text-faint">{v.id} · {v.length}</p></div>
                <button type="button" className="h-11 rounded-md border border-border px-3 text-sm" onClick={async () => {
                  const res = await startVideoRead({ data: { url: v.url, level: "standard" } });
                  rememberGuestLibrary(res.videoId);
                  await navigate({ to: "/watch/$id", params: { id: res.videoId }, search: { job: res.jobId } });
                }}>真正读取</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  );
}
