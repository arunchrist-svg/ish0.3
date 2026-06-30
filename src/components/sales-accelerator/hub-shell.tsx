"use client";

import { usePathname } from "next/navigation";
import { AppShell, BottomTabBar, MobileNavDrawer } from "@/design-system";
import { CreditBalanceBanner } from "@/components/sales-accelerator/credit-balance-banner";
import { SideNav } from "@/components/sales-accelerator/side-nav";
import { DemoBanner } from "@/components/sales-accelerator/demo-banner";
import { ReadOnlyBanner } from "@/components/sales-accelerator/read-only-banner";
import { SessionProvider, useSession } from "@/components/providers/session-provider";
import { useMobileNav } from "@/hooks/use-mobile-nav";
import { useInboxBadge } from "@/hooks/use-inbox-badge";
import { useAgentRuns } from "@/hooks/use-agent-runs";
import { AgentStatusBar } from "@/design-system";
import { NotificationBell } from "@/components/sales-accelerator/notification-bell";
import { cn } from "@/lib/utils";
import { space } from "@/design-system/tokens";

function HubShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session } = useSession();
  const { drawerOpen, closeDrawer, toggleDrawer } = useMobileNav();
  const { count: inboxBadge } = useInboxBadge();
  const { runs: agentRuns } = useAgentRuns();
  const hasActiveAgents = agentRuns.some((r) => r.status === "running" || r.status === "pending");

  return (
    <>
      <CreditBalanceBanner />
      <AppShell>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DemoBanner />
          <ReadOnlyBanner />
          <div className="hidden items-center justify-end gap-2 border-b border-ish-border bg-white px-6 py-1.5 lg:flex">
            <NotificationBell />
            <AgentStatusBar runs={agentRuns} className="flex-1" />
          </div>
          {hasActiveAgents ? (
            <div className="border-b border-ish-border/60 bg-ish-stratus-blue/8 px-4 py-1.5 lg:hidden">
              <AgentStatusBar runs={agentRuns} className="w-full" />
            </div>
          ) : null}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <SideNav />
            <div
              key={pathname}
              className={cn(
                "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden animate-ish-page-in",
                space.tabBarInset,
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
