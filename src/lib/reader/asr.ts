import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { CaptionCue } from "./types";
import { cuesFromAsrWords } from "./captions";
import { transcribeAudio } from "./xai";
export async function runAsr(audioPath: string, cacheDir: string): Promise<{ cues: CaptionCue[]; text: string; language?: string }> {
  const cache = path.join(cacheDir, "asr.json");
  if (existsSync(cache)) return JSON.parse(await readFile(cache, "utf8"));
  const buf = await readFile(audioPath);
  const mime = audioPath.endsWith(".m4a") || audioPath.endsWith(".mp4") ? "audio/mp4" : audioPath.endsWith(".webm") ? "audio/webm" : audioPath.endsWith(".wav") ? "audio/wav" : "audio/mpeg";
  const result = await transcribeAudio(new Blob([buf], { type: mime }), path.basename(audioPath));
  const cues = result.words?.length ? cuesFromAsrWords(result.words) : splitPlain(result.text);
  const saved = { cues, text: result.text, language: result.language };
  await writeFile(cache, JSON.stringify(saved));
  return saved;
}
function splitPlain(text: string): CaptionCue[] {
  return text.split(/(?<=[。！？.!?])\s+/).map((s) => s.trim()).filter(Boolean).map((p, i) => ({ start: i * 8, end: i * 8 + 8, text: p }));
}
