"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Columns3, List, MessageSquareReply } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchLeadStageCounts } from "@/lib/api-client";

type Props = {
  className?: string;
};

type ViewId = "board" | "list" | "replied";

function activeView(pathname: string): ViewId {
  if (pathname === "/leads/board" || pathname.startsWith("/leads/board/")) return "board";
  if (pathname === "/leads/replied" || pathname.startsWith("/leads/replied/")) return "replied";
  if (
    pathname === "/leads/list" ||
    pathname.startsWith("/leads/list/") ||
    pathname === "/leads" ||
    pathname.startsWith("/leads?")
  ) {
    return "list";
  }
  return "list";
}

function formatCount(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  return String(Math.max(0, Math.floor(n)));
}

const VIEWS: Array<{
  id: ViewId;
  href: string;
  label: string;
  title?: string;
  icon: typeof Columns3;
  countKey?: "list" | "replied";
}> = [
  { id: "board", href: "/leads/board", label: "Board", icon: Columns3 },
  { id: "list", href: "/leads/list", label: "List", icon: List, countKey: "list" },
  {
    id: "replied",
    href: "/leads/replied",
    label: "Replied",
    title: "Human replies only. Auto-replies and OOO are excluded.",
    icon: MessageSquareReply,
    countKey: "replied",
  },
];

export function LeadsViewToggle({ className }: Props) {
  const pathname = usePathname();
  const current = activeView(pathname);
  const [counts, setCounts] = useState<{ list: number; replied: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchLeadStageCounts()
      .then((data) => {
        if (!cancelled) setCounts(data.views);
      })
      .catch(() => {
        if (!cancelled) setCounts(null);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <div
      className={cn(
        "inline-flex h-[26px] shrink-0 items-center rounded-full border border-brand-stratus-blue/30 bg-white/90 p-0.5 shadow-[var(--shadow-brand-sm)] backdrop-blur-sm",
        className,
      )}
      role="group"
      aria-label="Leads view"
    >
      {VIEWS.map((view) => {
        const Icon = view.icon;
        const active = current === view.id;
        const count =
          view.countKey && counts ? formatCount(counts[view.countKey]) : null;
        const label = count != null ? `${view.label} (${count})` : view.label;
        return (
          <Link
            key={view.id}
            href={view.href}
            title={view.title}
            aria-current={active ? "page" : undefined}
            aria-label={view.title ?? label}
            className={cn(
              "inline-flex h-full items-center gap-1 rounded-full px-2.5 text-[10px] font-semibold transition-colors",
              active
                ? "bg-brand-stratus-blue text-white"
                : "text-brand-ink-soft hover:text-brand-ink",
            )}
          >
            <Icon className="size-3" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
