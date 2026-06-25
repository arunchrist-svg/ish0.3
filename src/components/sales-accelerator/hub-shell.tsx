"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/design-system";
import { CreditBalanceBanner } from "@/components/sales-accelerator/credit-balance-banner";
import { SideNav } from "@/components/sales-accelerator/side-nav";
import { DemoBanner } from "@/components/sales-accelerator/demo-banner";

export function HubShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <CreditBalanceBanner />
      <AppShell>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DemoBanner />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <SideNav />
            <div key={pathname} className="flex min-h-0 min-w-0 flex-1 overflow-hidden animate-ish-page-in">
              {children}
            </div>
          </div>
        </div>
      </AppShell>
    </>
  );
}
