"use client";

import { usePathname } from "next/navigation";
import { AppShell, BottomTabBar, MobileNavDrawer } from "@/design-system";
import { CreditBalanceBanner } from "@/components/sales-accelerator/credit-balance-banner";
import { SideNav } from "@/components/sales-accelerator/side-nav";
import { DemoBanner } from "@/components/sales-accelerator/demo-banner";
import { ReadOnlyBanner } from "@/components/sales-accelerator/read-only-banner";
import { SessionProvider, useSession } from "@/components/providers/session-provider";
import { HubPollingProvider } from "@/components/providers/hub-polling-provider";
import { useMobileNav } from "@/hooks/use-mobile-nav";
import { useInboxBadge } from "@/hooks/use-inbox-badge";
import { useAgentRuns } from "@/hooks/use-agent-runs";
import { AgentStatusBar } from "@/design-system";
import { cn } from "@/lib/utils";
import { space } from "@/design-system/tokens";

function HubShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session } = useSession();
  const { drawerOpen, closeDrawer, toggleDrawer } = useMobileNav();
  const { count: inboxBadge } = useInboxBadge();
  const { runs: agentRuns } = useAgentRuns();

  return (
    <>
      <CreditBalanceBanner />
      <AppShell>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DemoBanner />
          <ReadOnlyBanner />
          <AgentStatusBar runs={agentRuns} />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <SideNav />
            <div
              key={pathname}
              className={cn(
                "animate-brand-page-in flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
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
        credits={session?.permissions.canManageBilling ? (session?.credits ?? null) : null}
        onClose={closeDrawer}
      />
    </>
  );
}

export function HubShell({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <HubPollingProvider>
        <HubShellInner>{children}</HubShellInner>
      </HubPollingProvider>
    </SessionProvider>
  );
}
