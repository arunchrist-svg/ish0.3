"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, BarChart3, ChevronLeft, Clock, Contact, Home, LayoutDashboard,
  Pin, Rocket, Target, Telescope, TrendingUp, User, Users, GitFork,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CircleButton } from "@/design-system";
import { text } from "@/design-system/tokens";

const mainNav = [
  { icon: Home, label: "Home", href: "/" },
  { icon: Clock, label: "Recent" },
  { icon: Pin, label: "Pinned" },
];

const workNav = [
  { icon: Rocket, label: "Lead Accelerator", href: "/" },
  { icon: Telescope, label: "Scouting", href: "/scouting" },
  { icon: GitFork, label: "Yield Funnel", href: "/funnel" },
  { icon: LayoutDashboard, label: "Dashboards" },
  { icon: Activity, label: "Activities" },
];

const customerNav = [
  { icon: User, label: "Accounts" },
  { icon: Contact, label: "Contacts" },
];

const pipelineNav = [
  { icon: Target, label: "Leads" },
  { icon: Users, label: "Opportunities" },
];

const performanceNav = [
  { icon: Target, label: "Targets" },
  { icon: TrendingUp, label: "Forecasts" },
];

type NavItemEntry = { icon: React.ElementType; label: string; href?: string };

function NavItemRow({ icon: Icon, label, href }: NavItemEntry) {
  const pathname = usePathname();
  const active = href ? pathname === href : false;

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "mb-0.5 flex items-center gap-3 rounded-[10px] px-2 py-2",
          active ? "bg-ish-yellow" : "hover:bg-ish-app",
          active ? text.navItemActive : text.navItem,
        )}
      >
        <Icon className="size-4 shrink-0" />
        {label}
      </Link>
    );
  }

  return (
    <div className={cn("mb-0.5 flex items-center gap-3 rounded-[10px] px-2 py-2", text.navItem)}>
      <Icon className="size-4 shrink-0" />
      {label}
    </div>
  );
}

function NavSectionWithLinks({ title, items }: { title?: string; items: NavItemEntry[] }) {
  return (
    <>
      {title && <div className={cn("mb-1.5 mt-4 px-2", text.navSection)}>{title}</div>}
      {items.map(({ icon, label, href }) => (
        <NavItemRow key={label} icon={icon} label={label} href={href} />
      ))}
    </>
  );
}

export function SideNav() {
  return (
    <div className="w-[200px] shrink-0 border-r border-ish-border bg-white p-[22px_16px]">
      <div className="mb-6 flex items-center justify-between">
        <span className="text-lg font-bold text-ish-ink">Menu</span>
        <CircleButton size={28}><ChevronLeft className="size-3.5" /></CircleButton>
      </div>
      <NavSectionWithLinks items={mainNav} />
      <NavSectionWithLinks title="MY WORK" items={workNav} />
      <NavSectionWithLinks title="CUSTOMERS" items={customerNav} />
      <NavSectionWithLinks title="PIPELINE" items={pipelineNav} />
      <NavSectionWithLinks title="PERFORMANCE" items={performanceNav} />
    </div>
  );
}
