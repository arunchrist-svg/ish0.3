"use client";

import { FlaskConical } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";

export function DemoBanner() {
  const { session, loading } = useSession();

  if (loading || !session) return null;

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
