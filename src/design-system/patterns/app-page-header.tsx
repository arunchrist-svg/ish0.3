"use client";

import type { LucideIcon } from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";

type AppPageHeaderProps = {
  icon: LucideIcon | ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Slightly tighter padding for denser pages (e.g. board). */
  compact?: boolean;
};

/**
 * Desktop page header shared across hub tabs (Outreach, Scout, Inbox, …).
 * Hidden below `lg` where MobilePageLayout / MobileHeader owns the title.
 */
export function AppPageHeader({
  icon: Icon,
  title,
  subtitle,
  eyebrow,
  actions,
  children,
  className,
  compact,
}: AppPageHeaderProps) {
  return (
    <header
      className={cn(
        "ish-board-hero relative hidden shrink-0 overflow-hidden border-b border-brand-border/60 px-6 lg:block",
        compact ? "py-4" : "py-5",
        className,
      )}
    >
      <div className="ish-board-hero-stripe pointer-events-none absolute inset-x-0 top-0 h-[3px]" aria-hidden />
      <div className="relative flex flex-wrap items-center gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <div
            className={cn(
              "flex shrink-0 items-center justify-center rounded-2xl bg-brand-yellow shadow-[var(--shadow-brand-yellow-sm)]",
              compact ? "size-9 rounded-xl" : "size-11",
            )}
          >
            <Icon className={cn(compact ? "size-4" : "size-5", "text-brand-ink")} strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            {eyebrow ? (
              <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-ink-faint">
                {eyebrow}
              </p>
            ) : null}
            <h1
              className={cn(
                "font-extrabold tracking-tight text-brand-ink",
                compact ? "text-[18px]" : "text-[20px]",
              )}
            >
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-0.5 max-w-xl text-[12.5px] leading-relaxed text-brand-ink-soft">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="relative mt-3">{children}</div> : null}
    </header>
  );
}
