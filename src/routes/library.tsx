import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell } from "@/components/shell";
import { loadVideosByIds } from "@/lib/reader/actions";
import { readGuestLibrary } from "@/lib/reader/library-local";
import { LEVEL_META, type VideoRecord } from "@/lib/reader/types";
import { formatClock } from "@/lib/utils";
export const Route = createFileRoute("/library")({ component: LibraryPage });
const STATUS: Record<string, string> = { queued: "排队", running: "进行中", done: "完成", error: "失败", partial: "部分完成" };
function LibraryPage() {
  const [rows, setRows] = useState<VideoRecord[]>([]);
  useEffect(() => {
    const ids = readGuestLibrary();
    if (!ids.length) { setRows([]); return; }
    void loadVideosByIds({ data: ids }).then(setRows).catch(() => setRows([]));
  }, []);
  return (
    <Shell>
      <h1 className="font-display text-3xl tracking-tight">片库</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">你读过的视频。同一条链接会优先用缓存。</p>
      <ul className="mt-6 divide-y divide-line rounded-lg border border-border bg-surface">
        {rows.length === 0 && <li className="px-4 py-8 text-sm text-muted">还没有记录。</li>}
        {rows.map((v) => (
          <li key={v.id}>
            <Link to="/watch/$id" params={{ id: v.id }} className="flex min-h-11 items-start justify-between gap-3 px-4 py-3 hover:bg-raised">
              <div>
                <p className="text-sm font-medium">{v.title || v.id}</p>
                <p className="mt-0.5 text-[11px] text-faint">{v.platform} · {LEVEL_META[v.level]?.label ?? v.level} · {STATUS[v.status] ?? v.status}{v.durationSec ? ` · ${formatClock(v.durationSec)}` : ""}</p>
              </div>
              <span className="text-xs text-muted">{v.creatorName}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Shell>
  );
}
