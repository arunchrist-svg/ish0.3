"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { MOBILE_BOTTOM_TABS, getMobileBottomTabKey } from "@/lib/mobile-nav-config";
import { text } from "@/design-system/tokens";
import { hapticLight } from "@/lib/capacitor/platform";

type BottomTabBarProps = {
  pathname: string;
  inboxBadge?: number;
  onMorePress: () => void;
};

export function BottomTabBar({ pathname, inboxBadge = 0, onMorePress }: BottomTabBarProps) {
  const activeKey = getMobileBottomTabKey(pathname);

  const handlePress = (fn: () => void) => {
    void hapticLight();
    fn();
  };

  return (
    <nav
      className="ish-mobile-tab-bar fixed inset-x-0 bottom-0 z-40 border-t border-ish-border/40 bg-white/92 pb-[max(env(safe-area-inset-bottom),6px)] pt-1.5 backdrop-blur-2xl lg:hidden"
      aria-label="Main navigation"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-1">
        {MOBILE_BOTTOM_TABS.map((tab) => {
          const Icon = tab.icon;
          const isMore = tab.key === "more";
          const active = isMore ? activeKey === "more" : activeKey === tab.key;
          const badge = tab.key === "inbox" ? inboxBadge : 0;

          const inner = (
            <>
              <span
                className={cn(
                  "relative flex size-9 items-center justify-center rounded-2xl transition-all duration-200",
                  active && "bg-ish-stratus-blue/12",
                )}
              >
                <Icon
                  className={cn(
                    "size-[22px] transition-colors duration-200",
                    active ? "text-ish-stratus-blue" : "text-ish-ink-soft",
                  )}
                  strokeWidth={active ? 2.4 : 2}
                />
                {badge > 0 ? (
                  <span className="absolute -right-1.5 -top-1 min-w-[18px] rounded-full bg-ish-stratus-salmon px-1 py-0.5 text-center text-[10px] font-bold leading-none text-white">
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  "mt-0.5 text-[10px] font-semibold",
                  active ? "text-ish-stratus-blue" : text.caption,
                )}
              >
                {tab.label}
              </span>
            </>
          );

          const className = cn(
            "ish-touch-target relative flex min-h-[56px] min-w-[56px] flex-1 flex-col items-center justify-center rounded-2xl",
          );

          if (isMore) {
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handlePress(onMorePress)}
                className={className}
                aria-label="Open menu"
                aria-expanded={activeKey === "more"}
              >
                {inner}
              </button>
            );
          }

          return (
            <Link
              key={tab.key}
              href={tab.href}
              onClick={() => void hapticLight()}
              className={className}
              aria-current={active ? "page" : undefined}
            >
              {inner}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
