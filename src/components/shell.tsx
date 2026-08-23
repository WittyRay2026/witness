import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "读取" },
  { to: "/library", label: "片库" },
  { to: "/creator", label: "作者" },
  { to: "/about", label: "关于" },
] as const;

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-full bg-bg">
      <header className="border-b border-line bg-bg">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
          <Link to="/" preload="intent" className="flex min-h-11 shrink-0 items-center gap-2">
            <span className="grid size-7 place-items-center rounded-sm border border-border text-[11px] font-medium tracking-wide text-accent">W</span>
            <span className="font-display text-lg tracking-tight">Witness</span>
          </Link>
          <nav className="flex items-center gap-0.5">
            {NAV.map((item) => {
              const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
              return (
                <Link key={item.to} to={item.to} preload="intent" className={cn("inline-flex min-h-11 items-center rounded-sm px-2.5 text-sm sm:px-3", active ? "bg-raised text-fg" : "text-muted")}>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</div>
    </div>
  );
}
