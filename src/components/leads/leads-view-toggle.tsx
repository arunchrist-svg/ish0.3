"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Columns3, List } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

export function LeadsViewToggle({ className }: Props) {
  const pathname = usePathname();
  const isBoard = pathname === "/leads/board" || pathname.startsWith("/leads/board/");

  return (
    <div
      className={cn(
        "inline-flex h-[26px] shrink-0 items-center rounded-full border border-brand-stratus-blue/30 bg-white/90 p-0.5 shadow-[var(--shadow-brand-sm)] backdrop-blur-sm",
        className,
      )}
      role="group"
      aria-label="Leads view"
    >
      <Link
        href="/leads"
        aria-current={!isBoard ? "page" : undefined}
        className={cn(
          "inline-flex h-full items-center gap-1 rounded-full px-2.5 text-[10px] font-semibold transition-colors",
          !isBoard
            ? "bg-brand-stratus-blue text-white"
            : "text-brand-ink-soft hover:text-brand-ink",
        )}
      >
        <List className="size-3" />
        List
      </Link>
      <Link
        href="/leads/board"
        aria-current={isBoard ? "page" : undefined}
        className={cn(
          "inline-flex h-full items-center gap-1 rounded-full px-2.5 text-[10px] font-semibold transition-colors",
          isBoard
            ? "bg-brand-stratus-blue text-white"
            : "text-brand-ink-soft hover:text-brand-ink",
        )}
      >
        <Columns3 className="size-3" />
        Board
      </Link>
    </div>
  );
}
