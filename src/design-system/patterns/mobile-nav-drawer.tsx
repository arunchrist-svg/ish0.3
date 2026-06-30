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
import { ListGroup } from "@/design-system/primitives/list-group";
import { ISH_LOGO_URL } from "@/lib/brand";
import { hapticLight } from "@/lib/capacitor/platform";

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
      onClick={() => {
        void hapticLight();
        onClose();
      }}
      className={cn(
        "ish-list-row ish-touch-target",
        active && "bg-ish-stratus-blue/10",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl",
          active ? "bg-ish-stratus-blue text-white" : "bg-ish-canvas text-ish-ink-soft",
        )}
      >
        <Icon className="size-[18px]" />
      </span>
      <span className={cn("flex-1", active ? text.navItemActive : text.navItem)}>{item.label}</span>
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
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        aria-label="Close menu"
        onClick={onClose}
      />
      <div className="ish-mobile-drawer absolute inset-y-0 right-0 flex w-[min(340px,92vw)] flex-col bg-ish-canvas shadow-2xl">
        <div className="flex items-center justify-between ish-page-padding pb-4 pt-[max(env(safe-area-inset-top),16px)]">
          <img src={ISH_LOGO_URL} alt="ISH" className="h-8 w-auto" />
          <button
            type="button"
            onClick={onClose}
            className="ish-touch-target flex size-10 items-center justify-center rounded-full bg-white text-ish-ink shadow-ish-sm"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto ish-page-padding pb-8">
          {MOBILE_DRAWER_SECTIONS.map((section) => (
            <div key={section.title ?? "main"}>
              {section.title ? (
                <div className={cn("mb-2 px-1", text.navSection)}>{section.title}</div>
              ) : null}
              <ListGroup>
                {section.items.map((item) => (
                  <DrawerRow key={item.key} item={item} pathname={pathname} onClose={onClose} />
                ))}
              </ListGroup>
            </div>
          ))}

          {isSuperadmin ? (
            <div>
              <div className={cn("mb-2 px-1", text.navSection)}>Platform</div>
              <ListGroup>
                <DrawerRow item={MOBILE_ADMIN_ITEM} pathname={pathname} onClose={onClose} />
              </ListGroup>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
