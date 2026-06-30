import type { LucideIcon } from "lucide-react";
import {
  Columns3,
  Contact,
  GitFork,
  Home,
  Inbox,
  Mail,
  Pin,
  Radar,
  Rocket,
  Settings,
  Shield,
  Telescope,
  User,
} from "lucide-react";

export type MobileNavItem = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
};

export type MobileNavSection = {
  title?: string;
  items: MobileNavItem[];
};

export const MOBILE_BOTTOM_TABS: MobileNavItem[] = [
  { key: "home", label: "Home", href: "/", icon: Home },
  { key: "inbox", label: "Inbox", href: "/inbox", icon: Inbox },
  { key: "leads", label: "Leads", href: "/leads", icon: Rocket },
  { key: "scouting", label: "Scout", href: "/scouting", icon: Telescope },
  { key: "more", label: "More", href: "#more", icon: Settings },
];

export const MOBILE_DRAWER_SECTIONS: MobileNavSection[] = [
  {
    items: [{ key: "pinned", label: "Pinned", href: "/pinned", icon: Pin }],
  },
  {
    title: "MY WORK",
    items: [
      { key: "lead-board", label: "Lead Board", href: "/leads/board", icon: Columns3 },
      { key: "email", label: "Outreach", href: "/email", icon: Mail },
      { key: "brand-intelligence", label: "Brand Intelligence", href: "/brand-intelligence", icon: Radar },
      { key: "funnel", label: "Yield Funnel", href: "/funnel", icon: GitFork },
    ],
  },
  {
    title: "CUSTOMERS",
    items: [
      { key: "accounts", label: "Accounts", href: "/directory", icon: User },
      { key: "contacts", label: "Contacts", href: "/contacts", icon: Contact },
    ],
  },
  {
    title: "ACCOUNT",
    items: [
      { key: "profile", label: "Profile", href: "/profile", icon: User },
      { key: "settings", label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

export const MOBILE_ADMIN_ITEM: MobileNavItem = {
  key: "platform-admin",
  label: "Platform Admin",
  href: "/admin",
  icon: Shield,
};

export function isMobileNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/inbox") return pathname === "/inbox" || pathname.startsWith("/inbox/");
  if (href === "/leads") {
    return (
      (pathname === "/leads" || pathname.startsWith("/leads?")) &&
      !pathname.startsWith("/leads/board")
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function getMobileBottomTabKey(pathname: string): string {
  if (pathname === "/" || pathname.startsWith("/?")) return "home";
  if (pathname === "/inbox" || pathname.startsWith("/inbox")) return "inbox";
  if (pathname === "/leads" || (pathname.startsWith("/leads") && !pathname.startsWith("/leads/board"))) {
    return "leads";
  }
  if (pathname === "/scouting" || pathname.startsWith("/scouting")) return "scouting";
  return "more";
}

export function getMobilePageTitle(pathname: string): string {
  if (pathname === "/") return "Home";
  if (pathname === "/inbox") return "Inbox";
  if (pathname === "/pinned") return "Pinned";
  if (pathname === "/scouting" || pathname.startsWith("/scouting")) return "Scouting";
  if (pathname === "/leads/board") return "Lead Board";
  if (pathname === "/leads" || pathname.startsWith("/leads")) return "Leads";
  if (pathname === "/email") return "Outreach";
  if (pathname === "/brand-intelligence") return "Brand Intelligence";
  if (pathname === "/funnel") return "Yield Funnel";
  if (pathname === "/directory") return "Accounts";
  if (pathname === "/contacts") return "Contacts";
  if (pathname === "/profile") return "Profile";
  if (pathname === "/settings") return "Settings";
  if (pathname === "/admin") return "Platform Admin";
  if (pathname === "/agents") return "Agents";
  return "Sales Hub";
}
