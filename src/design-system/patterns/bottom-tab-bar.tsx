"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { MOBILE_BOTTOM_TABS, getMobileBottomTabKey } from "@/lib/mobile-nav-config";
import { text } from "@/design-system/tokens";

type BottomTabBarProps = {
  pathname: string;
  inboxBadge?: number;
  onMorePress: () => void;
};

export function BottomTabBar({ pathname, inboxBadge = 0, onMorePress }: BottomTabBarProps) {
  const activeKey = getMobileBottomTabKey(pathname);

  return (
    <nav
      className="ish-mobile-tab-bar fixed inset-x-0 bottom-0 z-40 border-t border-white/60 bg-white/88 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur-xl lg:hidden"
      aria-label="Main navigation"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2">
        {MOBILE_BOTTOM_TABS.map((tab) => {
          const Icon = tab.icon;
          const isMore = tab.key === "more";
          const active = isMore ? activeKey === "more" : activeKey === tab.key;
          const badge = tab.key === "inbox" ? inboxBadge : 0;

          const inner = (
            <>
              <span className="relative flex size-6 items-center justify-center">
                <Icon
                  className={cn(
                    "size-[22px] transition-transform duration-200",
                    active ? "scale-110 text-ish-ink" : "text-ish-ink-soft",
                  )}
                  strokeWidth={active ? 2.4 : 2}
                />
                {badge > 0 ? (
                  <span className="absolute -right-2 -top-1 min-w-[16px] rounded-full bg-ish-stratus-salmon px-1 py-0.5 text-center text-[9px] font-bold leading-none text-white">
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  "mt-0.5 text-[10px] font-semibold tracking-wide",
                  active ? "text-ish-ink" : text.caption,
                )}
              >
                {tab.label}
              </span>
              {active ? (
                <span className="absolute -top-0.5 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-ish-stratus-blue" />
              ) : null}
            </>
          );

          const className = cn(
            "relative flex min-h-[52px] min-w-[56px] flex-1 flex-col items-center justify-center rounded-xl transition-transform active:scale-[0.96]",
          );

          if (isMore) {
            return (
              <button
                key={tab.key}
                type="button"
                onClick={onMorePress}
                className={className}
                aria-label="Open menu"
                aria-expanded={activeKey === "more"}
              >
                {inner}
              </button>
            );
          }

          return (
            <Link key={tab.key} href={tab.href} className={className} aria-current={active ? "page" : undefined}>
              {inner}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
