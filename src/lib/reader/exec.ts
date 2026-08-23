import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
export const MEDIA_ROOT = process.env.MEDIA_DIR || (existsSync("/workspace") ? "/workspace/data/media" : "/tmp/witness-media");
export function mediaDir(platform: string, id: string): string {
  const dir = path.join(MEDIA_ROOT, platform, sanitize(id));
  mkdirSync(dir, { recursive: true });
  return dir;
}
export function sanitize(s: string): string { return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80); }
export function which(bin: string): string | null {
  for (const p of (process.env.PATH || "").split(path.delimiter)) {
    const full = path.join(p, bin);
    if (existsSync(full)) return full;
  }
  return null;
}
export function hasYtDlp(): boolean { return Boolean(which("yt-dlp") || which("yt-dlp.exe")); }
export function hasFfmpeg(): boolean { return Boolean(which("ffmpeg")); }
export interface RunResult { code: number; stdout: string; stderr: string; }
export function runCommand(cmd: string, args: string[], opts: { cwd?: string; timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: { ...process.env, ...opts.env, PYTHONWARNINGS: "ignore" }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error(`${cmd} timed out`)); }, opts.timeoutMs ?? 180_000);
    child.stdout.on("data", (d) => { stdout += String(d); });
    child.stderr.on("data", (d) => { stderr += String(d); });
    child.on("error", (err) => { clearTimeout(timer); reject(err); });
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? 1, stdout, stderr }); });
  });
}
export function cookieArgs(): string[] {
  const file = process.env.YTDLP_COOKIES || (existsSync("/workspace/data/cookies.txt") ? "/workspace/data/cookies.txt" : "");
  return file ? ["--cookies", file] : [];
}
export function cleanYtError(s: string): string {
  const lines = s.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("Deprecated"));
  const err = lines.find((l) => l.startsWith("ERROR:")) ?? lines.slice(-3).join(" ");
  return err.replace(/^ERROR:\s*/, "").slice(0, 400);
}
export async function ytDlpJson(url: string, extra: string[] = []): Promise<Record<string, unknown>> {
  const bin = which("yt-dlp");
  if (!bin) throw new Error("yt-dlp 未安装");
  const res = await runCommand(bin, ["--dump-json", "--no-download", "--no-warnings", "--no-playlist", ...cookieArgs(), ...extra, url], { timeoutMs: 90_000 });
  if (res.code !== 0) throw new Error(cleanYtError(res.stderr || res.stdout));
  const line = res.stdout.trim().split("\n").filter(Boolean).pop();
  if (!line) throw new Error("yt-dlp 没有返回 metadata");
  return JSON.parse(line) as Record<string, unknown>;
}
export async function ytDlpDownload(url: string, outTemplate: string, extra: string[] = [], timeoutMs = 240_000): Promise<RunResult> {
  const bin = which("yt-dlp");
  if (!bin) throw new Error("yt-dlp 未安装");
  return runCommand(bin, ["--no-warnings", "--no-playlist", "--newline", ...cookieArgs(), "-o", outTemplate, ...extra, url], { timeoutMs });
}
