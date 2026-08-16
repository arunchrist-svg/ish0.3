"use client";

import { FlaskConical, Mail } from "lucide-react";
import Link from "next/link";
import { useSession } from "@/components/providers/session-provider";
import { isNonLiveSendState, operationalSendState, sendStateLabel } from "@/lib/email/send-mode";

export function DemoBanner() {
  const { session, loading } = useSession();

  if (loading || !session) return null;

  const state = operationalSendState({
    emailConfigured: session.emailConfigured,
    sendMode: session.sendMode,
  });

  if (state === "unconfigured") {
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

  if (!isNonLiveSendState(state)) return null;

  const modeLabel = sendStateLabel(state);
  return (
    <div className="hidden lg:flex shrink-0 items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-[13px] font-medium text-amber-900">
      <FlaskConical className="size-4 shrink-0" />
      <span>
        {state === "test"
          ? `Test mode. Outreach goes only to your test inbox (${modeLabel}).`
          : `Dry run. Emails are logged only (${modeLabel}). Scout, enrich, and draft work without sending live outreach.`}
      </span>
    </div>
  );
}
