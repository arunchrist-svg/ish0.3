"use client";

import { usePathname } from "next/navigation";
import { AgentStatusBar, AppShell, BottomTabBar, MobileNavDrawer } from "@/design-system";
import { CreditBalanceBanner } from "@/components/sales-accelerator/credit-balance-banner";
import { SideNav } from "@/components/sales-accelerator/side-nav";
import { DemoBanner } from "@/components/sales-accelerator/demo-banner";
import { ReadOnlyBanner } from "@/components/sales-accelerator/read-only-banner";
import { SessionProvider, useSession } from "@/components/providers/session-provider";
import { useMobileNav } from "@/hooks/use-mobile-nav";
import { useInboxBadge } from "@/hooks/use-inbox-badge";
import { useAgentRuns } from "@/hooks/use-agent-runs";
import { CapacitorPushSetup } from "@/components/mobile/capacitor-push-setup";
import { NotificationBell } from "@/components/sales-accelerator/notification-bell";
import { cn } from "@/lib/utils";

function HubShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session } = useSession();
  const { drawerOpen, openDrawer, closeDrawer, toggleDrawer } = useMobileNav();
  const { count: inboxBadge } = useInboxBadge();
  const { runs: agentRuns } = useAgentRuns();

  return (
    <>
      <CapacitorPushSetup />
      <CreditBalanceBanner />
      <AppShell>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DemoBanner />
          <ReadOnlyBanner />
          <div className="flex items-center justify-end gap-2 border-b border-ish-border bg-white px-4 py-1.5 lg:px-6">
            <NotificationBell />
            <AgentStatusBar runs={agentRuns} className="lg:hidden flex-1" />
          </div>
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <SideNav />
            <div
              key={pathname}
              className={cn(
                "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden animate-ish-page-in",
                "pb-[calc(68px+env(safe-area-inset-bottom))] lg:pb-0",
              )}
            >
              {children}
            </div>
          </div>
        </div>
      </AppShell>
      <BottomTabBar pathname={pathname} inboxBadge={inboxBadge} onMorePress={toggleDrawer} />
      <MobileNavDrawer
        open={drawerOpen}
        pathname={pathname}
        isSuperadmin={session?.isSuperadmin ?? false}
        onClose={closeDrawer}
      />
    </>
  );
}

export function HubShell({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <HubShellInner>{children}</HubShellInner>
    </SessionProvider>
  );
}
