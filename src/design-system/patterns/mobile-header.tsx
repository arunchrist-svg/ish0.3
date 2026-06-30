"use client";

import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { text } from "@/design-system/tokens";

type MobileHeaderProps = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightSlot?: React.ReactNode;
  className?: string;
};

export function MobileHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  rightSlot,
  className,
}: MobileHeaderProps) {
  return (
    <header
      className={cn(
        "ish-mobile-header sticky top-0 z-30 flex shrink-0 items-center gap-2 border-b border-white/50 bg-white/80 px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)] backdrop-blur-xl lg:hidden",
        className,
      )}
    >
      {showBack ? (
        <button
          type="button"
          onClick={onBack}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ish-canvas text-ish-ink active:scale-95"
          aria-label="Go back"
        >
          <ChevronLeft className="size-5" />
        </button>
      ) : (
        <div className="size-10 shrink-0" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[17px] font-bold text-ish-ink">{title}</h1>
        {subtitle ? <p className="truncate text-xs text-ish-ink-soft">{subtitle}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">{rightSlot}</div>
    </header>
  );
}
