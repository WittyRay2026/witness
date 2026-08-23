import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Shell } from "@/components/shell";
import { LEVEL_META, READ_LEVELS } from "@/lib/reader/types";
import { pickUrlFromShare } from "@/lib/reader/url";
import { ShareShortcut } from "@/components/share-shortcut";

type Search = { err?: string; url?: string; u?: string; link?: string; text?: string; go?: string; v?: string };
function str(v: unknown): string { return typeof v === "string" ? v : ""; }
function urlFromSearch(s: Search): string {
  let url = str(s.url) || str(s.u) || str(s.link) || str(s.text);
  if (url && /youtube\.com\/watch\/?$/i.test(url.split("?")[0] ?? "") && str(s.v)) url = `https://www.youtube.com/watch?v=${s.v}`;
  if (!url && str(s.v) && /^[\w-]{11}$/.test(str(s.v))) url = `https://www.youtube.com/watch?v=${s.v}`;
  return pickUrlFromShare(url);
}
export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    err: str(s.err) || undefined, url: str(s.url) || undefined, u: str(s.u) || undefined,
    link: str(s.link) || undefined, text: str(s.text) || undefined, go: str(s.go) || undefined, v: str(s.v) || undefined,
  }),
  component: Home,
});
function Home() {
  const search = Route.useSearch();
  const fromShare = urlFromSearch(search);
  const [err, setErr] = useState(search.err);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const started = useRef(false);
  useEffect(() => {
    if (!fromShare || started.current || search.go === "0" || search.err) return;
    started.current = true;
    const t = window.setTimeout(() => formRef.current?.requestSubmit(), 250);
    return () => window.clearTimeout(t);
  }, [fromShare, search.go]);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const url = pickUrlFromShare(String(new FormData(form).get("url") ?? "").trim());
    if (!url) { setErr("请粘贴链接"); return; }
    setBusy(true); setErr(undefined);
    try {
      const res = await fetch("/api/read", { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } });
      const data = (await res.json().catch(() => null)) as { to?: string; error?: string; videoId?: string; jobId?: string } | null;
      if (data?.to) { window.location.assign(data.to); return; }
      if (data?.videoId) { window.location.assign(`/watch/${encodeURIComponent(data.videoId)}?job=${encodeURIComponent(data.jobId ?? "")}`); return; }
      setErr(data?.error || "没能开始读取"); setBusy(false);
    } catch { form.submit(); }
  }
  return (
    <Shell>
      <h1 className="font-display text-4xl leading-[1.1] tracking-tight sm:text-5xl">先看视频，<br />再开口说话。</h1>
      <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">Witness 读取公开链接：YouTube / 哔哩哩哩视频，或 X 上的一条推文。</p>
      <form ref={formRef} method="post" action="/api/read" onSubmit={(e) => void onSubmit(e)} className="relative z-10 mt-8 rounded-xl border border-border bg-surface p-3 sm:p-4">
        {fromShare ? <p className="mb-3 text-sm text-muted">已从分享填入链接</p> : null}
        {err ? <p className="mb-3 text-sm text-bad">{err}</p> : null}
        <input id="video-url" name="url" type="text" inputMode="url" required disabled={busy} defaultValue={fromShare} placeholder="粘贴视频或推文链接" className="h-12 w-full rounded-md border border-border bg-bg px-3 text-base outline-none" />
        <fieldset className="mt-3" disabled={busy}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {READ_LEVELS.map((lv) => (
              <label key={lv} className="block cursor-pointer">
                <input type="radio" name="level" value={lv} defaultChecked={lv === "standard"} className="peer sr-only" />
                <span className="flex min-h-12 flex-col justify-center rounded-md border border-border bg-bg px-3 py-2 peer-checked:bg-accent peer-checked:text-accent-fg">
                  <span className="text-[11px] opacity-70">{LEVEL_META[lv].command}</span>
                  <span className="text-sm font-medium">{LEVEL_META[lv].label}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" disabled={busy} className="mt-4 h-12 w-full rounded-md bg-accent text-sm font-medium text-accent-fg sm:w-auto sm:px-8">{busy ? "正在建立任务…" : "开始读取"}</button>
      </form>
      <ShareShortcut compact />
    </Shell>
  );
}
