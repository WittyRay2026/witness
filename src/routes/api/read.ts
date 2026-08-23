import { createFileRoute } from "@tanstack/react-router";
import { READ_LEVELS, type ReadLevel } from "@/lib/reader/types";
import { pickUrlFromShare } from "@/lib/reader/url";
import { startRead } from "@/lib/reader/pipeline";
export const Route = createFileRoute("/api/read")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const incoming = new URL(request.url);
        const url = pickUrlFromShare(incoming.searchParams.get("url") || incoming.searchParams.get("u") || incoming.searchParams.get("text") || "");
        if (!url) return redirect("/?err=" + encodeURIComponent("没有收到分享的链接"));
        try {
          const res = await startRead({ url, level: "standard", userId: "guest" });
          return redirect(`/watch/${encodeURIComponent(res.videoId)}?job=${encodeURIComponent(res.jobId)}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "读取失败";
          return redirect("/?err=" + encodeURIComponent(msg.slice(0, 180)));
        }
      },
      POST: async ({ request }) => {
        const form = await request.formData();
        const url = pickUrlFromShare(String(form.get("url") ?? "").trim());
        const rawLevel = String(form.get("level") ?? "standard");
        const level = (READ_LEVELS.includes(rawLevel as ReadLevel) ? rawLevel : "standard") as ReadLevel;
        if (!url) return redirect("/?err=" + encodeURIComponent("请粘贴链接"));
        try {
          const res = await startRead({ url, level, userId: "guest" });
          const dest = `/watch/${encodeURIComponent(res.videoId)}?job=${encodeURIComponent(res.jobId)}`;
          if (request.headers.get("accept")?.includes("application/json")) return Response.json({ videoId: res.videoId, jobId: res.jobId, to: dest });
          return redirect(dest);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "读取失败";
          if (request.headers.get("accept")?.includes("application/json")) return Response.json({ error: msg }, { status: 400 });
          return redirect("/?err=" + encodeURIComponent(msg.slice(0, 180)));
        }
      },
    },
  },
});
function redirect(to: string) {
  return new Response(null, { status: 303, headers: { Location: to } });
}
