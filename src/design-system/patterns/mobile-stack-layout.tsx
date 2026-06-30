"use client";

import { cn } from "@/lib/utils";

type MobileStackLayoutProps = {
  showDetail: boolean;
  list: React.ReactNode;
  detail: React.ReactNode;
  className?: string;
};

export function MobileStackLayout({ showDetail, list, detail, className }: MobileStackLayoutProps) {
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
      >
        {detail}
      </div>
    </div>
  );
}
