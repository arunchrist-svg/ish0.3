"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import { MobileHeader } from "./mobile-header";

type MobilePageLayoutProps = {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightSlot?: React.ReactNode;
  largeTitle?: boolean;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  footer?: React.ReactNode;
};

export function MobilePageLayout({
  title,
  subtitle,
  showBack,
  onBack,
  rightSlot,
  largeTitle = true,
  children,
  className,
  contentClassName,
  footer,
}: MobilePageLayoutProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden bg-ish-canvas", className)}>
      <MobileHeader
        title={title}
        subtitle={subtitle}
        showBack={showBack}
        onBack={onBack}
        rightSlot={rightSlot}
        largeTitle={largeTitle}
        scrollTargetRef={scrollRef}
      />
      <div
        ref={scrollRef}
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain",
          contentClassName,
        )}
      >
        {children}
      </div>
      {footer}
    </div>
  );
}
