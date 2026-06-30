"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  MOBILE_ADMIN_ITEM,
  MOBILE_DRAWER_SECTIONS,
  isMobileNavActive,
  type MobileNavItem,
} from "@/lib/mobile-nav-config";
import { text } from "@/design-system/tokens";
import { ISH_LOGO_URL } from "@/lib/brand";

type MobileNavDrawerProps = {
  open: boolean;
  pathname: string;
  isSuperadmin?: boolean;
  onClose: () => void;
};

function DrawerRow({
  item,
  pathname,
  onClose,
}: {
  item: MobileNavItem;
  pathname: string;
  onClose: () => void;
}) {
  const Icon = item.icon;
  const active = isMobileNavActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      onClick={onClose}
      className={cn(
        "flex min-h-[48px] items-center gap-3 rounded-xl px-3 py-2.5 transition-colors active:scale-[0.98]",
        active ? "bg-ish-black text-white" : "text-ish-ink hover:bg-black/[0.04]",
      )}
    >
      <Icon className={cn("size-5 shrink-0", active ? "text-white" : "text-ish-ink-soft")} />
      <span className={cn("flex-1 text-[15px]", active ? "font-semibold" : "font-medium")}>{item.label}</span>
      {item.badge != null && item.badge > 0 ? (
        <span className="rounded-full bg-ish-stratus-salmon px-2 py-0.5 text-[10px] font-bold text-white">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

export function MobileNavDrawer({ open, pathname, isSuperadmin = false, onClose }: MobileNavDrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-label="Close menu"
        onClick={onClose}
      />
      <div className="ish-mobile-drawer absolute inset-y-0 right-0 flex w-[min(320px,88vw)] flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-ish-border/70 px-4 pb-4 pt-[max(env(safe-area-inset-top),16px)]">
          <img src={ISH_LOGO_URL} alt="ISH" className="h-8 w-auto" />
          <button
            type="button"
            onClick={onClose}
            className="flex size-10 items-center justify-center rounded-full bg-ish-canvas text-ish-ink active:scale-95"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          {MOBILE_DRAWER_SECTIONS.map((section) => (
            <div key={section.title ?? "main"} className="mb-4">
              {section.title ? (
                <div className={cn("mb-2 px-3", text.navSection)}>{section.title}</div>
              ) : null}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <DrawerRow key={item.key} item={item} pathname={pathname} onClose={onClose} />
                ))}
              </div>
            </div>
          ))}

          {isSuperadmin ? (
            <div className="border-t border-ish-border/70 pt-4">
              <DrawerRow item={MOBILE_ADMIN_ITEM} pathname={pathname} onClose={onClose} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
