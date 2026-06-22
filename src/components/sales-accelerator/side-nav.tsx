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

type NavItemEntry = {
  icon: React.ElementType;
  label: string;
  href?: string;
  key: string;
};

const mainNav: NavItemEntry[] = [
  { icon: Home, label: "Home", href: "/", key: "home" },
  { icon: Pin, label: "Pinned", key: "pinned" },
];

const workNav: NavItemEntry[] = [
  { icon: Rocket, label: "Lead Accelerator", href: "/", key: "lead-accelerator" },
  { icon: Telescope, label: "Scouting", href: "/scouting", key: "scouting" },
  { icon: GitFork, label: "Yield Funnel", href: "/funnel", key: "funnel" },
  { icon: Settings, label: "Settings", href: "/settings", key: "settings" },
];

const customerNav: NavItemEntry[] = [
  { icon: User, label: "Accounts", href: "/directory", key: "accounts" },
  { icon: Contact, label: "Contacts", key: "contacts" },
];

const sections: { title?: string; items: NavItemEntry[] }[] = [
  { items: mainNav },
  { title: "MY WORK", items: workNav },
  { title: "CUSTOMERS", items: customerNav },
];

const linkedItems = sections.flatMap((section) => section.items.filter((item) => item.href));

function isActive(pathname: string, href?: string) {
  if (!href) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getActiveKey(pathname: string) {
  const match = linkedItems.find((item) => item.href && isActive(pathname, item.href));
  if (!match) return "";
  if (pathname === "/" && match.href === "/") return "lead-accelerator";
  return match.key;
}

function NavItemRow({
  item,
  pathname,
  pendingKey,
  register,
  onNavigate,
}: {
  item: NavItemEntry;
  pathname: string;
  pendingKey: string | null;
  register: (key: string) => (node: HTMLElement | null) => void;
  onNavigate: (key: string) => void;
}) {
  const { icon: Icon, label, href, key } = item;
  const routeActive = href ? isActive(pathname, href) : false;
  const pending = pendingKey === key;
  const highlighted = routeActive || pending;

  const className = cn(
    "group relative z-10 mb-0.5 flex items-center gap-3 rounded-[10px] px-2 py-2",
    "transition-[color,transform,opacity] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
    "hover:translate-x-1 active:scale-[0.98]",
    !highlighted && "hover:bg-ish-app/80",
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
      <span
        className={cn(
          "transition-[font-weight,opacity] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          highlighted ? "font-semibold" : "font-medium",
        )}
      >
        {label}
      </span>
    </>
  );

  if (href) {
    return (
      <Link
        ref={register(key)}
        href={href}
        onClick={() => onNavigate(key)}
        className={className}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={cn(className, "cursor-default opacity-70")}>
      {content}
    </div>
  );
}

export function SideNav() {
  const pathname = usePathname();
  const activeKey = getActiveKey(pathname);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const indicatorKey = pendingKey ?? activeKey;
  const { containerRef, register, rect, ready } = useSlidingHighlight(indicatorKey);

  useEffect(() => {
    if (pendingKey && activeKey === pendingKey) {
      setPendingKey(null);
    }
  }, [pathname, activeKey, pendingKey]);

  return (
    <div className="flex h-full w-[200px] shrink-0 flex-col overflow-hidden border-r border-ish-border bg-white p-[22px_16px]">
      <div className="mb-6 flex items-center justify-between">
        <span className="text-lg font-bold text-ish-ink">Menu</span>
        <CircleButton size={28}><ChevronLeft className="size-3.5" /></CircleButton>
      </div>

      <nav ref={containerRef} className="relative min-h-0 flex-1 overflow-y-auto">
        <SlidingHighlight rect={rect} ready={ready} />

        {sections.map((section) => (
          <div key={section.title ?? "main"}>
            {section.title && (
              <div className={cn("mb-1.5 mt-4 px-2", text.navSection)}>{section.title}</div>
            )}
            {section.items.map((item) => (
              <NavItemRow
                key={item.key}
                item={item}
                pathname={pathname}
                pendingKey={pendingKey}
                register={register}
                onNavigate={setPendingKey}
              />
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}
