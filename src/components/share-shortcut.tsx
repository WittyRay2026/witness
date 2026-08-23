import { useEffect, useState } from "react";
export function ShareShortcut({ compact = false }: { compact?: boolean }) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => { setOrigin(window.location.origin); }, []);
  const template = origin ? `${origin}/open?url=` : "https://你的域名/open?url=";
  async function copy() {
    if (!origin) return;
    try { await navigator.clipboard.writeText(template); setCopied(true); window.setTimeout(() => setCopied(false), 1600); } catch {}
  }
  if (compact) {
    return <p className="mt-4 max-w-xl text-xs leading-relaxed text-muted">iPhone 快捷指令请打开 <span className="break-all font-mono text-fg">{template}</span> 再接编码后的原链接。</p>;
  }
  return (
    <section className="mt-10 max-w-2xl">
      <h2 className="font-display text-2xl">iPhone 快捷指令</h2>
      <div className="mt-3 flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 break-all font-mono text-xs text-fg">{template}编码后的链接</code>
        <button type="button" onClick={() => void copy()} className="h-10 shrink-0 rounded-md border border-border px-3 text-sm">{copied ? "已复制" : "复制前缀"}</button>
      </div>
    </section>
  );
}
