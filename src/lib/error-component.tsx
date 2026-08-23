import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg px-6 text-center text-fg">
      <div>
        <span className="mx-auto grid size-10 place-items-center text-bad" aria-hidden="true">
          <TriangleAlert className="size-8" strokeWidth={1.6} />
        </span>
        <h1 className="mt-3 font-display text-xl">出了点问题</h1>
        <p className="mx-auto mt-2 max-w-md text-sm break-words text-muted">
          {error.message || "发生了意外错误，请刷新页面。"}
        </p>
      </div>
    </main>
  );
}
