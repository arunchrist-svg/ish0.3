"use client";

import { Eye, FlaskConical, Mail, Zap } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { usePermissions } from "@/hooks/use-permissions";

export type HubAlert = {
  id: string;
  icon: typeof Zap;
  title: string;
  description: string;
  href?: string;
  hrefLabel?: string;
};

export function useHubAlerts(): HubAlert[] {
  const { session, loading } = useSession();
  const { isReadOnly, loading: permLoading } = usePermissions();

  if (loading || permLoading || !session) return [];

  const alerts: HubAlert[] = [];

  if (session.credits <= 50) {
    alerts.push({
      id: "credits",
      icon: Zap,
      title: session.credits <= 0 ? "Out of credits" : "Low credits",
      description:
        session.credits <= 0
          ? "Scout and outreach are blocked until you top up."
          : `Only ${session.credits} credits left. Consider topping up before your next scout.`,
      href: "/settings?tab=billing",
      hrefLabel: "Credits",
    });
  }

  if (session.emailConfigured === false) {
    alerts.push({
      id: "email-setup",
      icon: Mail,
      title: "Connect outbound email",
      description:
        "Add your own Gmail App Password or Resend key before sending outreach. Nothing is shared from other companies.",
      href: "/settings?tab=email",
      hrefLabel: "Settings → Email",
    });
  } else if (session.tenant.demoMode || session.sendMode === "dry_run") {
    alerts.push({
      id: "demo",
      icon: FlaskConical,
      title: "Demo mode",
      description: `Emails are logged only (${session.sendMode}). Scout, enrich, and draft work without sending live outreach.`,
      href: "/settings?tab=email",
      hrefLabel: "Settings → Email",
    });
  }

  if (isReadOnly) {
    alerts.push({
      id: "readonly",
      icon: Eye,
      title: "View-only access",
      description: "Contact your admin to make changes.",
    });
  }

  return alerts;
}
