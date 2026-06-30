"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

type MobileStackLayoutProps = {
  showDetail: boolean;
  list: React.ReactNode;
  detail: React.ReactNode;
  className?: string;
  onBack?: () => void;
};

export function MobileStackLayout({ showDetail, list, detail, className, onBack }: MobileStackLayoutProps) {
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  function onTouchStart(e: React.TouchEvent) {
    if (!showDetail || !onBack) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!showDetail || !onBack) return;
    const x = e.changedTouches[0].clientX;
    const y = e.changedTouches[0].clientY;
    const dx = x - touchStartX.current;
    const dy = Math.abs(y - touchStartY.current);
    if (touchStartX.current <= 28 && dx > 80 && dy < 60) {
      onBack();
    }
  }

  return (
    <div className={cn("relative min-h-0 min-w-0 flex-1", className)}>
      <div
        className={cn(
          "absolute inset-0 flex min-h-0 flex-col overflow-hidden transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:relative lg:translate-x-0",
          showDetail ? "-translate-x-full lg:translate-x-0" : "translate-x-0",
        )}
      >
        {list}
      </div>
      <div
        className={cn(
          "absolute inset-0 flex min-h-0 flex-col overflow-hidden transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:relative lg:flex-1 lg:translate-x-0",
          showDetail ? "translate-x-0" : "translate-x-full lg:translate-x-0",
        )}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {detail}
      </div>
    </div>
  );
}
