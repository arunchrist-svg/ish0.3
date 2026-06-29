"use client";

import { useState } from "react";
import { Inbox, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { syncInboxReplies } from "@/lib/api-client";
import { toast } from "sonner";

type Props = {
  leadId?: string;
  leadName?: string;
  onSynced?: () => void | Promise<void>;
  className?: string;
  compact?: boolean;
};

export function SyncRepliesButton({ leadId, leadName, onSynced, className, compact }: Props) {
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await syncInboxReplies();
      await onSynced?.();

      if (result.errors.length > 0) {
        toast.error(result.errors[0], {
          description: result.errors.length > 1 ? `${result.errors.length - 1} more issue(s)` : undefined,
        });
        return;
      }

      if (result.processed > 0) {
        toast.success(
          result.processed === 1
            ? `Found 1 new reply${leadName ? ` (${leadName})` : ""}`
            : `Found ${result.processed} new replies`,
          { description: "Follow-ups paused. Open the Replies tab or refresh this lead." },
        );
        return;
      }

      toast.info("No new replies in inbox", {
        description: leadId
          ? "Checked Gmail for this workspace. If they replied, confirm SMTP inbox matches where mail arrived."
          : `Checked ${result.checked} recent message(s).`,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not sync inbox");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleSync()}
      disabled={syncing}
      title="Check Gmail inbox for new replies from outreached leads"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-ish-border bg-white font-semibold text-ish-ink shadow-[var(--shadow-ish-sm)] transition-all hover:border-ish-ink/20 disabled:opacity-60",
        compact ? "h-7 px-3 text-[11px]" : "rounded-[14px] px-4 py-2.5 text-[12px]",
        className,
      )}
    >
      {syncing ? <Loader2 className="size-3.5 animate-spin" /> : <Inbox className="size-3.5" />}
      {syncing ? "Syncing…" : "Sync replies"}
    </button>
  );
}
