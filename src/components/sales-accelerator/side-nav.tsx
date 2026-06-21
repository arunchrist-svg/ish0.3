"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, BarChart3, ChevronLeft, Clock, Contact, Home, LayoutDashboard,
  Pin, Rocket, Settings, Target, Telescope, TrendingUp, User, Users, GitFork, Bot, BookOpen,
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
  { icon: Clock, label: "Recent", key: "recent" },
  { icon: Pin, label: "Pinned", key: "pinned" },
];

const workNav: NavItemEntry[] = [
  { icon: Rocket, label: "Lead Accelerator", href: "/", key: "lead-accelerator" },
  { icon: Telescope, label: "Scouting", href: "/scouting", key: "scouting" },
  { icon: BookOpen, label: "Directory", href: "/directory", key: "directory" },
  { icon: Bot, label: "Agents", href: "/agents", key: "agents" },
  { icon: GitFork, label: "Yield Funnel", href: "/funnel", key: "funnel" },
  { icon: Settings, label: "Settings", href: "/settings", key: "settings" },
  { icon: LayoutDashboard, label: "Dashboards", key: "dashboards" },
  { icon: Activity, label: "Activities", key: "activities" },
];

const customerNav: NavItemEntry[] = [
  { icon: User, label: "Accounts", href: "/directory", key: "accounts" },
  { icon: Contact, label: "Contacts", key: "contacts" },
];

const pipelineNav: NavItemEntry[] = [
  { icon: Target, label: "Leads", key: "leads" },
  { icon: Users, label: "Opportunities", key: "opportunities" },
];

const performanceNav: NavItemEntry[] = [
  { icon: Target, label: "Targets", key: "targets" },
  { icon: TrendingUp, label: "Forecasts", key: "forecasts" },
];

const sections: { title?: string; items: NavItemEntry[] }[] = [
  { items: mainNav },
  { title: "MY WORK", items: workNav },
  { title: "CUSTOMERS", items: customerNav },
  { title: "PIPELINE", items: pipelineNav },
  { title: "PERFORMANCE", items: performanceNav },
];

const linkedItems = sections.flatMap((section) => section.items.filter((item) => item.href));

function isActive(pathname: string, href?: string) {
  if (!href) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getActiveKey(pathname: string) {
  const exact = linkedItems.find((item) => item.href && isActive(pathname, item.href));
  if (!exact) return "";
  if (pathname === "/" && exact.href === "/") return "lead-accelerator";
  return exact.key;
}

function NavItemRow({
  item,
  pathname,
  register,
}: {
  item: NavItemEntry;
  pathname: string;
  register: (key: string) => (node: HTMLElement | null) => void;
}) {
  const { icon: Icon, label, href, key } = item;
  const active = href ? isActive(pathname, href) : false;
  const indicatorActive = getActiveKey(pathname) === key;

  const className = cn(
    "group relative z-10 mb-0.5 flex items-center gap-3 rounded-[10px] px-2 py-2",
    "transition-[color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
    "hover:translate-x-0.5 active:scale-[0.98]",
    !indicatorActive && "hover:bg-ish-app/80",
    active ? text.navItemActive : text.navItem,
  );

  const content = (
    <>
      <Icon
        className={cn(
          "size-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          active ? "scale-110" : "group-hover:scale-105",
        )}
      />
      <span className="transition-[font-weight] duration-200">{label}</span>
    </>
  );

  if (href) {
    return (
      <Link
        ref={register(key)}
        href={href}
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
  const { containerRef, register, rect, ready } = useSlidingHighlight(activeKey);

  return (
    <div className="w-[200px] shrink-0 border-r border-ish-border bg-white p-[22px_16px]">
      <div className="mb-6 flex items-center justify-between">
        <span className="text-lg font-bold text-ish-ink">Menu</span>
        <CircleButton size={28}><ChevronLeft className="size-3.5" /></CircleButton>
      </div>

      <nav ref={containerRef} className="relative">
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
                register={register}
              />
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}
