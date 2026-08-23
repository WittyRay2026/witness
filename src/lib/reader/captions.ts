import type { CaptionCue } from "./types";
export function cuesFromJson3(raw: unknown): CaptionCue[] {
  const data = raw as { events?: { tStartMs?: number; dDurationMs?: number; segs?: { utf8?: string }[] }[] };
  const out: CaptionCue[] = [];
  for (const ev of data.events ?? []) {
    const text = (ev.segs ?? []).map((s) => s.utf8 ?? "").join("").replace(/\n+/g, " ").trim();
    if (!text || text === "\n") continue;
    const start = (ev.tStartMs ?? 0) / 1000;
    out.push({ start, end: start + (ev.dDurationMs ?? 2000) / 1000, text });
  }
  return mergeCues(out);
}
export function cuesFromVtt(vtt: string): CaptionCue[] {
  const blocks = vtt.replace(/^\uFEFF/, "").split(/\n\n+/);
  const out: CaptionCue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => !l.startsWith("WEBVTT") && !l.startsWith("NOTE") && l.trim());
    const time = lines.find((l) => l.includes("-->"));
    if (!time) continue;
    const m = time.match(/(\d+):(\d{2})(?::(\d{2}))?[\.,](\d+)\s*-->\s*(\d+):(\d{2})(?::(\d{2}))?[\.,](\d+)/);
    if (!m) continue;
    const toSec = (h: string | undefined, mm: string, ss: string | undefined, ms: string) => {
      const hours = ss ? Number(h) : 0;
      const minutes = ss ? Number(mm) : Number(h);
      const seconds = ss ? Number(ss) : Number(mm);
      return hours * 3600 + minutes * 60 + seconds + Number(ms.padEnd(3, "0").slice(0, 3)) / 1000;
    };
    const text = lines.filter((l) => l !== time && !/^\d+$/.test(l)).join(" ").replace(/<[^>]+>/g, "").trim();
    if (text) out.push({ start: toSec(m[1], m[2], m[3], m[4]), end: toSec(m[5], m[6], m[7], m[8]), text });
  }
  return mergeCues(out);
}
export function cuesFromBiliJson(raw: unknown): CaptionCue[] {
  const data = raw as { body?: { from: number; to: number; content: string }[] };
  return mergeCues((data.body ?? []).filter((b) => b.content?.trim()).map((b) => ({ start: b.from, end: b.to, text: b.content.trim() })));
}
export function cuesFromAsrWords(words: { text: string; start: number; end: number }[], gap = 1.4): CaptionCue[] {
  const out: CaptionCue[] = [];
  let buf = ""; let start = 0; let end = 0;
  for (const w of words) {
    if (!buf) { start = w.start; end = w.end; buf = w.text; continue; }
    if (w.start - end > gap || buf.length > 80) { out.push({ start, end, text: buf.trim() }); buf = w.text; start = w.start; end = w.end; }
    else { buf += w.text; end = w.end; }
  }
  if (buf.trim()) out.push({ start, end, text: buf.trim() });
  return out;
}
export function mergeCues(cues: CaptionCue[]): CaptionCue[] { return cues.filter((c) => c.text.trim()); }
export function transcriptPlain(cues: CaptionCue[], limit = 80_000): string {
  let s = cues.map((c) => `[${fmt(c.start)}] ${c.text}`).join("\n");
  if (s.length > limit) s = s.slice(0, limit) + "\n…";
  return s;
}
function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  const p = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(r)}` : `${p(m)}:${p(r)}`;
}
export function pickBestCaptionLang(langs: string[], prefer = ["zh-Hans", "zh-CN", "zh", "zh-Hant", "en", "en-US", "en-GB"]): string | null {
  const set = new Set(langs.map((l) => l.toLowerCase()));
  for (const p of prefer) if (set.has(p.toLowerCase())) return langs.find((l) => l.toLowerCase() === p.toLowerCase()) ?? null;
  return langs.find((l) => l.toLowerCase().startsWith("zh")) ?? langs.find((l) => l.toLowerCase().startsWith("en")) ?? langs[0] ?? null;
}
export function captionQuality(cues: CaptionCue[]): "good" | "thin" | "empty" {
  if (!cues.length) return "empty";
  const chars = cues.reduce((n, c) => n + c.text.replace(/\s/g, "").length, 0);
  const span = (cues.at(-1)?.end ?? 0) - (cues[0]?.start ?? 0);
  if (chars < 40) return "thin";
  if (span > 60 && chars / Math.max(span, 1) < 1.2) return "thin";
  return "good";
}
