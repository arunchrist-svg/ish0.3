"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/components/providers/session-provider";
import { useEffect, useState } from "react";
import {
  Bot, ChevronLeft, Contact, Flame, Home,
  Mail, Pin, Radar, Rocket, Settings, Shield, Telescope, User, GitFork,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SlidingHighlight } from "@/design-system/primitives/sliding-highlight";
import { useSlidingHighlight } from "@/design-system/hooks/use-sliding-highlight";
import { text } from "@/design-system/tokens";
import { PRODUCT_NAME } from "@/lib/brand";
import { CreditBalanceChip } from "@/components/sales-accelerator/credit-balance-chip";
import { NotificationBell } from "@/components/sales-accelerator/notification-bell";
import { useInboxBadge } from "@/hooks/use-inbox-badge";

type NavItemEntry = {
  icon: React.ElementType;
  label: string;
  href?: string;
  key: string;
  badge?: number;
};

const mainNav: NavItemEntry[] = [
  { icon: Home, label: "Home", href: "/", key: "home" },
];

const workNav: NavItemEntry[] = [
  { icon: Telescope, label: "Scouting", href: "/scouting", key: "scouting" },
  { icon: Rocket, label: "Leads", href: "/leads", key: "leads" },
  { icon: Mail, label: "Outreach", href: "/email", key: "email" },
  { icon: Bot, label: "Agent Console", href: "/agents/console", key: "agent-console" },
];

const moreNav: NavItemEntry[] = [
  { icon: Flame, label: "Season War Room", href: "/season", key: "season" },
  { icon: Radar, label: "Brand Intelligence", href: "/brand-intelligence", key: "brand-intelligence" },
  { icon: GitFork, label: "Yield Funnel", href: "/funnel", key: "funnel" },
  { icon: Pin, label: "Pinned", href: "/pinned", key: "pinned" },
  { icon: User, label: "Accounts", href: "/directory", key: "accounts" },
  { icon: Contact, label: "Contacts", href: "/contacts", key: "contacts" },
];

const bottomNav: NavItemEntry[] = [
  { icon: User, label: "Profile", href: "/profile", key: "profile" },
  { icon: Settings, label: "Settings", href: "/settings", key: "settings" },
];

const sections: { title?: string; items: NavItemEntry[] }[] = [
  { items: mainNav },
  { title: "MY WORK", items: workNav },
  { title: "MORE", items: moreNav },
];

const allLinkedItems = [...sections.flatMap((s) => s.items), ...bottomNav].filter((item) => item.href);

function isActive(pathname: string, href?: string) {
  if (!href) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getActiveKey(pathname: string) {
  if (pathname === "/leads" || pathname.startsWith("/leads/") || pathname.startsWith("/leads?")) {
    return "leads";
  }
  const matches = allLinkedItems
    .filter((item) => item.href && isActive(pathname, item.href))
    .sort((a, b) => (b.href?.length ?? 0) - (a.href?.length ?? 0));
  const match = matches[0];
  if (!match) return "";
  if (pathname === "/directory" || pathname.startsWith("/directory/")) return "accounts";
  return match.key;
}

function NavItemRow({
  item,
  pathname,
  pendingKey,
  collapsed,
  register,
  onNavigate,
}: {
  item: NavItemEntry;
  pathname: string;
  pendingKey: string | null;
  collapsed: boolean;
  register: (key: string) => (node: HTMLElement | null) => void;
  onNavigate: (key: string) => void;
}) {
  const { icon: Icon, label, href, key } = item;
  const routeActive = href ? isActive(pathname, href) : false;
  const pending = pendingKey === key;
  const highlighted = routeActive || pending;

  const className = cn(
    "group relative z-10 mb-0.5 flex items-center rounded-[10px] py-2",
    collapsed ? "justify-center px-2" : "gap-3 px-2",
    "transition-[color,transform,padding] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
    !collapsed && "hover:translate-x-1",
    "active:scale-[0.98]",
    !highlighted && "hover:bg-black/[0.04]",
    highlighted ? text.navItemActive : text.navItem,
    pending && "opacity-90",
  );

  const content = (
    <>
      <Icon
        className={cn(
          "size-4 shrink-0 transition-[transform,color] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          highlighted ? "scale-110 text-brand-ink" : "text-brand-ink-soft group-hover:scale-105 group-hover:text-brand-ink",
        )}
      />
      {!collapsed && (
        <span
          className={cn(
            "flex min-w-0 flex-1 items-center justify-between gap-2 transition-[font-weight,opacity,width] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            highlighted ? "font-semibold" : "font-medium",
          )}
        >
          <span className="truncate">{label}</span>
          {item.badge != null && item.badge > 0 ? (
            <span className="shrink-0 rounded-full bg-brand-stratus-salmon px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-white">
              {item.badge > 99 ? "99+" : item.badge}
            </span>
          ) : null}
        </span>
      )}
      {collapsed && item.badge != null && item.badge > 0 ? (
        <span className="absolute right-1 top-1 size-2 rounded-full bg-brand-stratus-salmon ring-2 ring-white" aria-hidden />
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link
        ref={register(key)}
        href={href}
        title={collapsed ? label : undefined}
        onClick={() => onNavigate(key)}
        className={cn(className, item.badge ? "relative" : undefined)}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={cn(className, "cursor-default opacity-70")} title={collapsed ? label : undefined}>
      {content}
    </div>
  );
}

export function SideNav() {
  const pathname = usePathname();
  const { session } = useSession();
  const isSuperadmin = session?.isSuperadmin ?? false;
  // Same polled attention count as mobile inbox: Needs Review + unreplied Replies.
  const { count: outreachBadge, refresh: refreshOutreachBadge } = useInboxBadge();

  useEffect(() => {
    if (pathname === "/email" || pathname.startsWith("/email/")) {
      refreshOutreachBadge();
    }
  }, [pathname, refreshOutreachBadge]);

  const activeKey = getActiveKey(pathname);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const indicatorKey = pendingKey ?? activeKey;
  const { containerRef, register, rect, ready } = useSlidingHighlight(indicatorKey);

  useEffect(() => {
    if (pendingKey && activeKey === pendingKey) {
      const timeout = window.setTimeout(() => setPendingKey(null), 0);
      return () => window.clearTimeout(timeout);
    }
  }, [pathname, activeKey, pendingKey]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const stored = localStorage.getItem("ish-side-nav-collapsed");
      if (stored === "true") setCollapsed(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("ish-side-nav-collapsed", String(next));
      return next;
    });
  }

  return (
    <div
      className={cn(
        "ish-glass-sidebar hidden h-full shrink-0 flex-col lg:flex overflow-hidden border-r border-white/50 transition-[width] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        collapsed ? "w-[68px]" : "w-[200px]",
      )}
    >
      <div
        className={cn(
          "ish-brand-header flex shrink-0 items-center bg-brand-black text-white",
          collapsed ? "flex-col gap-2.5 px-2 py-4" : "justify-between gap-2 px-4 py-4",
        )}
      >
        <span
          className={cn(
            "ish-brand-name shrink-0 font-extrabold tracking-tight text-white",
            collapsed ? "text-[15px]" : "text-[18px]",
          )}
        >
          {PRODUCT_NAME}
        </span>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand menu" : "Collapse menu"}
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/12 text-white transition hover:bg-white/20 active:scale-95"
        >
          <ChevronLeft
            className={cn(
              "size-3.5 transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              collapsed && "rotate-180",
            )}
          />
        </button>
      </div>

      <nav
        ref={containerRef}
        className={cn(
          "relative flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden",
          collapsed ? "px-2 py-3" : "px-4 py-4",
        )}
      >
        <div className="flex-1">
          <SlidingHighlight rect={rect} ready={ready} />

          {sections.map((section) => (
            <div key={section.title ?? "main"}>
              {section.title && !collapsed && (
                <div className={cn("mb-1.5 mt-4 px-2", text.navSection)}>{section.title}</div>
              )}
              {section.title && collapsed && <div className="mb-2 mt-3 border-t border-brand-border/70" />}
              {section.items.map((item) => (
                <NavItemRow
                  key={item.key}
                  item={item.key === "email" ? { ...item, badge: outreachBadge } : item}
                  pathname={pathname}
                  pendingKey={pendingKey}
                  collapsed={collapsed}
                  register={register}
                  onNavigate={setPendingKey}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="mt-2">
          <div className="mb-2 border-t border-brand-border" />
          <div
            className={cn(
              "mb-2 flex items-center gap-1.5",
              collapsed ? "flex-col justify-center" : "px-0.5",
            )}
          >
            <CreditBalanceChip
              compact={collapsed}
              className={collapsed ? "px-1.5" : "min-w-0 flex-1 justify-center"}
            />
            <NotificationBell compact={collapsed} />
          </div>
          {isSuperadmin ? (
            <NavItemRow
              item={{ icon: Shield, label: "Platform Admin", href: "/admin", key: "platform-admin" }}
              pathname={pathname}
              pendingKey={pendingKey}
              collapsed={collapsed}
              register={register}
              onNavigate={setPendingKey}
            />
          ) : null}
          {bottomNav.map((item) => (
            <NavItemRow
              key={item.key}
              item={item}
              pathname={pathname}
              pendingKey={pendingKey}
              collapsed={collapsed}
              register={register}
              onNavigate={setPendingKey}
            />
          ))}
        </div>
      </nav>
    </div>
  );
}
