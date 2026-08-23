import { createFileRoute } from "@tanstack/react-router";
import { pickUrlFromShare } from "@/lib/reader/url";
import { startRead } from "@/lib/reader/pipeline";

export const Route = createFileRoute("/open")({
  validateSearch: (s: Record<string, unknown>) => ({
    url: typeof s.url === "string" ? s.url : undefined,
    u: typeof s.u === "string" ? s.u : undefined,
    text: typeof s.text === "string" ? s.text : undefined,
  }),
  server: {
    handlers: {
      GET: async ({ request }) => {
        const incoming = new URL(request.url);
        const raw =
          incoming.searchParams.get("url") ||
          incoming.searchParams.get("u") ||
          incoming.searchParams.get("link") ||
          incoming.searchParams.get("text") ||
          "";
        const url = pickUrlFromShare(raw);
        if (!url) {
          return redirect("/?err=" + encodeURIComponent("没有收到分享的链接。"));
        }
        try {
          const res = await startRead({ url, level: "standard", userId: "guest" });
          return redirect(`/watch/${encodeURIComponent(res.videoId)}?job=${encodeURIComponent(res.jobId)}`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : "读取失败";
          return redirect("/?err=" + encodeURIComponent(msg.slice(0, 180)));
        }
      },
    },
  },
});

function redirect(to: string) {
  return new Response(null, { status: 303, headers: { Location: to } });
}
