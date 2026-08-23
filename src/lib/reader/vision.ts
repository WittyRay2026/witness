import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { FrameAnalysis, KeyFrame } from "./types";
import { chatJson, VISION_MODEL } from "./xai";

const BATCH = 3;

export async function analyzeKeyframes(
  frames: KeyFrame[],
  cacheDir: string,
  context: { title: string; transcriptHint: string },
): Promise<KeyFrame[]> {
  const cache = path.join(cacheDir, "vision.json");
  if (existsSync(cache)) {
    const saved = JSON.parse(await readFile(cache, "utf8")) as KeyFrame[];
    const byId = new Map(saved.map((f) => [f.id, f]));
    return frames.map((f) => byId.get(f.id) ?? f);
  }
  const analyzed: KeyFrame[] = [];
  for (let i = 0; i < frames.length; i += BATCH) {
    const batch = frames.slice(i, i + BATCH);
    const contents: unknown[] = [];
    for (const frame of batch) {
      const buf = await readFile(frame.path);
      contents.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${buf.toString("base64")}` } });
    }
    contents.push({
      type: "text",
      text: `Frames from "${context.title}". Transcript hint: ${context.transcriptHint.slice(0, 800)}
If a contact sheet, describe left-to-right, top-to-bottom. Return JSON array of {what,objects,people,onScreenText,charts,tables,maps,numbers,ui,sources,visualImportance,subtitleInsufficient}.`,
    });
    try {
      const arr = await chatJson<FrameAnalysis[]>([
        { role: "system", content: "Extract grounded visual evidence. Never claim unseen details." },
        { role: "user", content: contents },
      ], { maxTokens: 1800, model: VISION_MODEL });
      const list = Array.isArray(arr) ? arr : [arr];
      batch.forEach((frame, idx) => analyzed.push({ ...frame, analysis: normalizeAnalysis(list[idx]) }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      batch.forEach((frame) => analyzed.push({
        ...frame,
        analysis: { what: `视觉分析失败：${msg.slice(0, 160)}`, objects: [], people: [], onScreenText: [], charts: [], tables: [], maps: [], numbers: [], ui: [], sources: [], visualImportance: "low", subtitleInsufficient: false },
      }));
    }
  }
  await writeFile(cache, JSON.stringify(analyzed));
  return analyzed;
}

function normalizeAnalysis(raw: Partial<FrameAnalysis> | undefined): FrameAnalysis {
  return {
    what: raw?.what ?? "", objects: arr(raw?.objects), people: arr(raw?.people),
    onScreenText: arr(raw?.onScreenText), charts: arr(raw?.charts), tables: arr(raw?.tables),
    maps: arr(raw?.maps), numbers: arr(raw?.numbers), ui: arr(raw?.ui), sources: arr(raw?.sources),
    visualImportance: raw?.visualImportance === "high" || raw?.visualImportance === "medium" ? raw.visualImportance : "low",
    subtitleInsufficient: Boolean(raw?.subtitleInsufficient),
  };
}
function arr(v: unknown): string[] { return Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []; }

export function detectVisualNeed(frames: KeyFrame[], transcript: string): { needed: boolean; reason: string } {
  const cues = ["如图", "看这", "PPT", "图表", "代码", "this chart", "as you can see", "on the screen", "slide"];
  const hit = cues.find((c) => transcript.toLowerCase().includes(c.toLowerCase()));
  const visualHeavy = frames.filter((f) => {
    const a = f.analysis;
    if (!a) return false;
    return a.subtitleInsufficient || a.visualImportance === "high" || a.charts.length + a.tables.length + a.maps.length + a.ui.length + a.onScreenText.length >= 2;
  });
  if (visualHeavy.length >= 2) return { needed: true, reason: `${visualHeavy.length} 个关键帧包含图表/界面/屏幕文字，仅靠字幕会丢失。` };
  if (hit) return { needed: true, reason: `口述出现「${hit}」，作者在指向画面。` };
  if (!frames.length) return { needed: false, reason: "没有可用画面。" };
  return { needed: false, reason: "抽样画面以人物/口播为主。" };
}
