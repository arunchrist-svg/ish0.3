"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { text } from "@/design-system/tokens";
import { HubAlertsButton } from "@/components/sales-accelerator/hub-alerts-button";

type MobileHeaderProps = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightSlot?: React.ReactNode;
  largeTitle?: boolean;
  scrollTargetRef?: React.RefObject<HTMLElement | null>;
  className?: string;
};

export function MobileHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  rightSlot,
  largeTitle = false,
  scrollTargetRef,
  className,
}: MobileHeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const target = scrollTargetRef?.current;
    if (!target) return;
    const onScroll = () => setScrolled(target.scrollTop > 8);
    onScroll();
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => target.removeEventListener("scroll", onScroll);
  }, [scrollTargetRef]);

  if (largeTitle) {
    return (
      <header
        ref={headerRef}
        className={cn(
          "ish-mobile-header sticky top-0 z-30 shrink-0 border-b border-transparent bg-ish-canvas px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)] lg:hidden",
          scrolled && "ish-mobile-header-scrolled border-ish-border/50",
          className,
        )}
      >
        <div className="flex items-center justify-between gap-2">
          {showBack ? (
            <button
              type="button"
              onClick={onBack}
              className="ish-touch-target flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-ish-ink shadow-ish-sm"
              aria-label="Go back"
            >
              <ChevronLeft className="size-5" />
            </button>
          ) : (
            <div className="size-10 shrink-0" aria-hidden />
          )}
          <div className="flex shrink-0 items-center gap-1.5"><HubAlertsButton /><>{rightSlot}</></div>
        </div>
        <div className={cn("mt-2 min-w-0", scrolled ? "hidden" : "block")}>
          <h1 className={text.largeTitle}>{title}</h1>
          {subtitle ? <p className={cn("mt-1 truncate", text.listSubtitle)}>{subtitle}</p> : null}
        </div>
        {scrolled ? (
          <h1 className={cn("mt-1 truncate text-center", text.pageTitle)}>{title}</h1>
        ) : null}
      </header>
    );
  }

  return (
    <header
      ref={headerRef}
      className={cn(
        "ish-mobile-header sticky top-0 z-30 flex shrink-0 items-center gap-2 border-b border-ish-border/50 bg-white/90 px-4 pb-3 pt-[max(env(safe-area-inset-top),12px)] backdrop-blur-xl lg:hidden",
        className,
      )}
    >
      {showBack ? (
        <button
          type="button"
          onClick={onBack}
          className="ish-touch-target flex size-10 shrink-0 items-center justify-center rounded-full bg-ish-canvas text-ish-ink"
          aria-label="Go back"
        >
          <ChevronLeft className="size-5" />
        </button>
      ) : (
        <div className="size-10 shrink-0" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <h1 className={cn("truncate", text.pageTitle)}>{title}</h1>
        {subtitle ? <p className={cn("truncate", text.caption)}>{subtitle}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5"><HubAlertsButton /><>{rightSlot}</></div>
    </header>
  );
}
