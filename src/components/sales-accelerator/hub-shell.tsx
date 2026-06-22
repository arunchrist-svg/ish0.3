"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/design-system";
import { SideNav } from "@/components/sales-accelerator/side-nav";

export function HubShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AppShell>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <SideNav />
        <div
          key={pathname}
          className="flex min-h-0 min-w-0 flex-1 overflow-hidden animate-ish-page-in"
        >
          {children}
        </div>
      </div>
    </AppShell>
  );
}
