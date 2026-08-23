import type { EvidenceBoard as Board, EvidenceState } from "@/lib/reader/types";
import { cn } from "@/lib/utils";
const ROWS: { key: keyof Board; label: string }[] = [
  { key: "page", label: "页面" }, { key: "metadata", label: "资料" }, { key: "officialCaptions", label: "官方字幕" },
  { key: "audio", label: "音轨" }, { key: "asr", label: "语音转写" }, { key: "keyframes", label: "关键帧" },
  { key: "vision", label: "视觉分析" }, { key: "ocr", label: "屏幕文字" }, { key: "sources", label: "引用来源" }, { key: "factCheck", label: "外部核验" },
];
function mark(state: EvidenceState) {
  if (state === "yes") return { glyph: "●", cls: "text-ok", word: "已读取" };
  if (state === "partial") return { glyph: "◐", cls: "text-warn", word: "部分" };
  if (state === "skipped") return { glyph: "○", cls: "text-faint", word: "跳过" };
  return { glyph: "○", cls: "text-bad", word: "未获得" };
}
export function EvidenceBoard({ board }: { board: Board }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <h2 className="font-display text-xl tracking-tight">证据板</h2>
      <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
        {ROWS.map((row) => {
          const state = board[row.key];
          if (typeof state !== "string") return null;
          const m = mark(state as EvidenceState);
          return (
            <li key={row.key} className="flex items-center justify-between gap-3 rounded-sm px-1 py-1 text-sm">
              <span className="text-muted">{row.label}</span>
              <span className={cn("font-mono text-xs", m.cls)}>{m.glyph} {m.word}</span>
            </li>
          );
        })}
      </ul>
      {board.notes.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-line pt-3 text-xs leading-relaxed text-muted">
          {board.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
    </section>
  );
}
