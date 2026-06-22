"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronLeft, Contact, Home,
  Pin, Rocket, Settings, Telescope, User, GitFork,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CircleButton } from "@/design-system";
import { SlidingHighlight } from "@/design-system/primitives/sliding-highlight";
import { useSlidingHighlight } from "@/design-system/hooks/use-sliding-highlight";
import { text } from "@/design-system/tokens";
import { ISH_LOGO_URL } from "@/lib/brand";

type NavItemEntry = {
  icon: React.ElementType;
  label: string;
  href?: string;
  key: string;
};

const mainNav: NavItemEntry[] = [
  { icon: Home, label: "Home", href: "/", key: "home" },
  { icon: Pin, label: "Pinned", href: "/pinned", key: "pinned" },
];

const workNav: NavItemEntry[] = [
  { icon: Telescope, label: "Scouting", href: "/scouting", key: "scouting" },
  { icon: Rocket, label: "Lead Accelerator", href: "/", key: "lead-accelerator" },
  { icon: GitFork, label: "Yield Funnel", href: "/funnel", key: "funnel" },
];

const customerNav: NavItemEntry[] = [
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
  { title: "CUSTOMERS", items: customerNav },
];

const allLinkedItems = [...sections.flatMap((s) => s.items), ...bottomNav].filter((item) => item.href);

function isActive(pathname: string, href?: string) {
  if (!href) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getActiveKey(pathname: string) {
  const match = allLinkedItems.find((item) => item.href && isActive(pathname, item.href));
  if (!match) return "";
  if (pathname === "/" && match.href === "/") return "lead-accelerator";
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
          highlighted ? "scale-110 text-ish-ink" : "text-ish-ink-soft group-hover:scale-105 group-hover:text-ish-ink",
        )}
      />
      {!collapsed && (
        <span
          className={cn(
            "transition-[font-weight,opacity,width] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            highlighted ? "font-semibold" : "font-medium",
          )}
        >
          {label}
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link
        ref={register(key)}
        href={href}
        title={collapsed ? label : undefined}
        onClick={() => onNavigate(key)}
        className={className}
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
  const activeKey = getActiveKey(pathname);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const indicatorKey = pendingKey ?? activeKey;
  const { containerRef, register, rect, ready } = useSlidingHighlight(indicatorKey);

  useEffect(() => {
    if (pendingKey && activeKey === pendingKey) {
      setPendingKey(null);
    }
  }, [pathname, activeKey, pendingKey]);

  useEffect(() => {
    const stored = localStorage.getItem("ish-side-nav-collapsed");
    if (stored === "true") setCollapsed(true);
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
        "ish-glass-sidebar flex h-full shrink-0 flex-col overflow-hidden border-r border-white/50 transition-[width,padding] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        collapsed ? "w-[68px] px-2 py-[22px]" : "w-[200px] p-[22px_16px]",
      )}
    >
      <div
        className={cn(
          "mb-5 flex shrink-0 items-center",
          collapsed ? "flex-col gap-2.5" : "justify-between gap-2",
        )}
      >
        <img
          src={ISH_LOGO_URL}
          alt="ISH"
          className={cn(
            "w-auto shrink-0",
            collapsed ? "h-7" : "h-8",
          )}
        />
        <CircleButton
          size={28}
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand menu" : "Collapse menu"}
          className="transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
        >
          <ChevronLeft
            className={cn(
              "size-3.5 transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              collapsed && "rotate-180",
            )}
          />
        </CircleButton>
      </div>

      <nav ref={containerRef} className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        <div className="flex-1">
          <SlidingHighlight rect={rect} ready={ready} />

          {sections.map((section) => (
            <div key={section.title ?? "main"}>
              {section.title && !collapsed && (
                <div className={cn("mb-1.5 mt-4 px-2", text.navSection)}>{section.title}</div>
              )}
              {section.title && collapsed && <div className="mb-2 mt-3 border-t border-ish-border/70" />}
              {section.items.map((item) => (
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
          ))}
        </div>

        <div className="mt-2">
          <div className="mb-2 border-t border-ish-border" />
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
