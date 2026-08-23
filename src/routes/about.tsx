import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { ShareShortcut } from "@/components/share-shortcut";
export const Route = createFileRoute("/about")({ component: AboutPage });
function AboutPage() {
  return (
    <Shell>
      <h1 className="font-display text-4xl tracking-tight">关于 Witness</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">贴一条公开链接，尽量真正观看字幕、声音和画面。</p>
      <ShareShortcut />
    </Shell>
  );
}
