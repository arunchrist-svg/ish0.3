"use client";

import type { LucideIcon } from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "@/lib/utils";

type AppPageHeaderProps = {
  icon: LucideIcon | ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  eyebrow?: string;
  /** Sits immediately after the title on the same row (e.g. List / Board). */
  titleAddon?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Slightly tighter padding for denser pages (e.g. board). */
  compact?: boolean;
  /** Skip the top accent stripe when a parent already draws a continuous one. */
  hideAccent?: boolean;
};

/**
 * Desktop page header shared across hub tabs (Outreach, Scout, Inbox, …).
 * Hidden below `lg` where MobilePageLayout / MobileHeader owns the title.
 */
export function AppPageHeader({
  icon: Icon,
  title,
  eyebrow,
  titleAddon,
  actions,
  children,
  className,
  compact,
  hideAccent,
}: AppPageHeaderProps) {
  return (
    <header
      className={cn(
        "relative hidden shrink-0 overflow-hidden px-6 lg:block",
        hideAccent
          ? "z-20 border-b-0 bg-transparent"
          : "ish-board-hero border-b border-brand-border/60",
        compact ? "py-4" : "py-5",
        className,
      )}
    >
      {hideAccent ? null : (
        <div className="ish-board-hero-stripe pointer-events-none absolute inset-x-0 top-0" aria-hidden />
      )}
      <div className="relative flex w-full items-center gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
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
          </div>
          {titleAddon ? <div className="shrink-0">{titleAddon}</div> : null}
        </div>
        {actions ? <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="relative mt-3">{children}</div> : null}
    </header>
  );
}
