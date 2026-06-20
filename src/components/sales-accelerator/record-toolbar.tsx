"use client";

import { FileText, MoreHorizontal, RefreshCw, Save, CheckCircle, Send, MessageSquare } from "lucide-react";
import { Button } from "@/design-system";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { runWriter, markReplied } from "@/lib/api-client";
import type { LeadDetailRecord } from "@/lib/api-client";

type Props = {
  lead: LeadDetailRecord;
  onAction: () => void;
  onLeadUpdated: () => void;
};

export function RecordToolbar({ lead, onAction, onLeadUpdated }: Props) {
  async function handleGenerate() {
    try {
      toast.info("Generating email draft…");
      await runWriter(lead.id);
      toast.success("Email draft ready — check approval card");
      onAction();
      onLeadUpdated();
    } catch (e) {
      toast.error("Writer failed. Check logs.");
      console.error(e);
    }
  }

  async function handleMarkReplied() {
    try {
      await markReplied(lead.id);
      toast.success("Marked as replied");
      onAction();
      onLeadUpdated();
    } catch {
      toast.error("Could not mark as replied");
    }
  }

  const showGenerate = ["scouted", "researched"].includes(lead.status);
  const showApprove = lead.status === "draft_ready";
  const showMarkReplied = lead.status === "outreached";

  return (
    <div className="flex flex-wrap gap-2 rounded-t-[22px] bg-ish-yellow-gradient px-[22px] py-4">
      <Button
        variant="ghost"
        size="sm"
        className="h-auto rounded-[18px] bg-white/55 px-3.5 py-1.5 text-xs font-semibold text-ish-ink hover:bg-white/70"
        onClick={() => toast.info("Saved")}
      >
        <Save className="size-3.5" />
        Save
      </Button>

      {showGenerate && (
        <Button
          variant="ghost"
          size="sm"
          className="h-auto rounded-[18px] bg-ish-black px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-ish-black/90"
          onClick={handleGenerate}
        >
          <FileText className="size-3.5" />
          Generate Email
        </Button>
      )}

      {showApprove && (
        <Button
          variant="ghost"
          size="sm"
          className="h-auto rounded-[18px] bg-ish-green px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-ish-green/90"
          onClick={() => {
            const el = document.getElementById("approval-card");
            if (el) el.scrollIntoView({ behavior: "smooth" });
            else toast.info("Scroll down to the approval card");
          }}
        >
          <CheckCircle className="size-3.5" />
          Review Draft
        </Button>
      )}

      {showMarkReplied && (
        <Button
          variant="ghost"
          size="sm"
          className="h-auto rounded-[18px] bg-ish-black px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-ish-black/90"
          onClick={handleMarkReplied}
        >
          <MessageSquare className="size-3.5" />
          Mark Replied
        </Button>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="h-auto rounded-[18px] bg-white/55 px-3.5 py-1.5 text-xs font-semibold text-ish-ink hover:bg-white/70"
        onClick={onAction}
      >
        <RefreshCw className="size-3.5" />
        Refresh
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-auto rounded-[18px] bg-white/55 px-3.5 py-1.5 text-xs font-semibold text-ish-ink hover:bg-white/70"
      >
        <MoreHorizontal className="size-3.5" />
      </Button>
    </div>
  );
}
