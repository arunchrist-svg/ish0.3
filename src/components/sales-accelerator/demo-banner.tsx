"use client";

import { FlaskConical, Mail } from "lucide-react";
import Link from "next/link";
import { useSession } from "@/components/providers/session-provider";

export function DemoBanner() {
  const { session, loading } = useSession();

  if (loading || !session) return null;

  if (session.emailConfigured === false) {
    return (
      <div className="hidden lg:flex shrink-0 items-center justify-center gap-2 border-b border-sky-200 bg-sky-50 px-4 py-2 text-center text-[13px] font-medium text-sky-950">
        <Mail className="size-4 shrink-0" />
        <span>
          Connect your outbound email in{" "}
          <Link href="/settings?tab=email" className="underline underline-offset-2">
            Settings → Email
          </Link>
          . Use your own Gmail or Resend credentials.
        </span>
      </div>
    );
  }

  const show = session.tenant.demoMode || session.sendMode === "dry_run";
  if (!show) return null;

  return (
    <div className="hidden lg:flex shrink-0 items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-[13px] font-medium text-amber-900">
      <FlaskConical className="size-4 shrink-0" />
      <span>
        Demo mode. Emails are logged only ({session.sendMode}). Scout, enrich, and draft work without sending live outreach.
      </span>
    </div>
  );
}
