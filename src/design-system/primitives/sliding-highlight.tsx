"use client";

import { cn } from "@/lib/utils";

type SlidingHighlightProps = {
  rect: { top: number; left: number; width: number; height: number } | null;
  ready?: boolean;
  className?: string;
};

export function SlidingHighlight({ rect, ready, className }: SlidingHighlightProps) {
  if (!rect) return null;

  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute z-0 rounded-[10px] bg-ish-yellow shadow-[var(--shadow-ish-yellow-sm)]",
        "transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        ready ? "opacity-100" : "opacity-0",
        className,
      )}
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }}
    />
  );
}
