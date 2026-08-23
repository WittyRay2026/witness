import { createFileRoute } from "@tanstack/react-router";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { MEDIA_ROOT } from "@/lib/reader/exec";
function mime(p: string): string {
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".mp4")) return "video/mp4";
  if (p.endsWith(".mp3")) return "audio/mpeg";
  return "image/jpeg";
}
export const Route = createFileRoute("/api/media")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const rel = (url.searchParams.get("p") ?? "").replace(/\0/g, "").replace(/^\/+/, "");
        if (!rel || rel.includes("..")) return new Response("Not found", { status: 404 });
        const full = path.join(MEDIA_ROOT, rel);
        const root = path.resolve(MEDIA_ROOT);
        if (!path.resolve(full).startsWith(root) || !existsSync(full)) return new Response("Not found", { status: 404 });
        const buf = await readFile(full);
        return new Response(buf, { headers: { "Content-Type": mime(full), "Cache-Control": "public, max-age=86400" } });
      },
    },
  },
});
