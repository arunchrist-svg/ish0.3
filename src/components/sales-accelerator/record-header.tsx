"use client";

import { useState } from "react";
import { MoreHorizontal, RefreshCw, MessageSquare, Package, Handshake, Trophy, Pin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { QueueItem } from "@/lib/data";
import { Button, IshAvatar, text } from "@/design-system";
import { toast } from "sonner";
import { markReplied, updateLeadStatus, togglePin } from "@/lib/api-client";
import type { LeadDetailRecord } from "@/lib/api-client";
import { getNextManualStatus } from "@/lib/pipeline-status";
import { AppModal } from "@/components/ui/app-modal";

type Props = {
  current: QueueItem;
  lead: LeadDetailRecord;
  onRefresh: (showOverlay?: boolean) => void | Promise<void>;
  refreshing?: boolean;
  onLeadUpdated: () => void;
};

function formatSubtitle(title: string | undefined, company: string | undefined) {
  const t = title && title !== "—" ? title : null;
  const c = company && company !== "—" ? company : null;
  if (t && c) return `${t} · ${c}`;
  return t ?? c ?? "—";
}

export function RecordHeader({ current, lead, onRefresh, refreshing, onLeadUpdated }: Props) {
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [dealAmount, setDealAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pinning, setPinning] = useState(false);

  async function handleMarkReplied() {
    try {
      await markReplied(lead.id);
      toast.success("Marked as replied");
      void onRefresh(false);
      onLeadUpdated();
    } catch {
      toast.error("Could not mark as replied");
    }
  }

  async function handleManualAdvance(nextStatus: "tasting_sent" | "negotiate" | "closed", amount?: string) {
    setSubmitting(true);
    try {
      await updateLeadStatus(lead.id, {
        status: nextStatus,
        closedDealAmount: amount,
      });
      const labels: Record<string, string> = {
        tasting_sent: "Tasting sent",
        negotiate: "Negotiate",
        closed: "Deal closed",
      };
      toast.success(`Moved to ${labels[nextStatus]}`);
      setCloseDialogOpen(false);
      setDealAmount("");
      void onRefresh(false);
      onLeadUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update status");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTogglePin() {
    setPinning(true);
    try {
      const newPinned = !lead.isPinned;
      await togglePin("lead", lead.id, newPinned);
      toast.success(newPinned ? "Pinned to quick access" : "Unpinned");
      void onRefresh(false);
    } catch {
      toast.error("Failed to update pin");
    } finally {
      setPinning(false);
    }
  }

  const showMarkReplied = lead.status === "outreached";
  const nextManual = getNextManualStatus(lead.status);

  const actionBtn =
    "h-auto rounded-[18px] px-3.5 py-1.5 text-xs font-semibold";

  return (
    <>
      <div className="flex items-center justify-between gap-4 px-[22px] py-4">
        <div className="flex min-w-0 items-center gap-[18px]">
          <IshAvatar name={current.name} index={0} size={64} />
          <div className="min-w-0">
            <div className={cn("mb-1 truncate", text.display)}>{current.name}</div>
            <div className="truncate text-[13px] font-semibold text-ish-ink-soft">
              {formatSubtitle(current.title, current.company)}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {showMarkReplied && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(actionBtn, "bg-ish-black text-white hover:bg-ish-black/90")}
              onClick={handleMarkReplied}
            >
              <MessageSquare className="size-3.5" />
              Mark Replied
            </Button>
          )}

          {nextManual === "tasting_sent" && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(actionBtn, "bg-ish-black text-white hover:bg-ish-black/90")}
              disabled={submitting}
              onClick={() => handleManualAdvance("tasting_sent")}
            >
              <Package className="size-3.5" />
              Mark Tasting Sent
            </Button>
          )}

          {nextManual === "negotiate" && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(actionBtn, "bg-ish-black text-white hover:bg-ish-black/90")}
              disabled={submitting}
              onClick={() => handleManualAdvance("negotiate")}
            >
              <Handshake className="size-3.5" />
              Move to Negotiate
            </Button>
          )}

          {nextManual === "closed" && (
            <Button
              variant="ghost"
              size="sm"
              className={cn(actionBtn, "bg-ish-green text-white hover:bg-ish-green/90")}
              onClick={() => setCloseDialogOpen(true)}
            >
              <Trophy className="size-3.5" />
              Close Deal
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            disabled={refreshing}
            className={cn(actionBtn, "bg-white/55 text-ish-ink hover:bg-white/70")}
            onClick={() => void onRefresh(true)}
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            disabled={pinning || refreshing}
            className={cn(
              actionBtn,
              lead.isPinned
                ? "bg-ish-yellow text-ish-ink hover:bg-ish-yellow/80"
                : "bg-white/55 text-ish-ink hover:bg-white/70",
            )}
            onClick={handleTogglePin}
          >
            {pinning ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Pin className={cn("size-3.5", lead.isPinned && "fill-current")} />
            )}
            {pinning ? "Saving…" : lead.isPinned ? "Pinned" : "Pin"}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className={cn(actionBtn, "bg-white/55 text-ish-ink hover:bg-white/70")}
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </div>
      </div>

      <AppModal open={closeDialogOpen} onClose={() => { setCloseDialogOpen(false); setDealAmount(""); }}>
        <h3 className="text-[15px] font-bold text-ish-ink">Close Deal</h3>
        <p className="mt-1 text-[13px] text-ish-ink-soft">Enter the final deal amount to mark this lead as closed.</p>
        <label className="mt-4 block text-[12px] font-semibold text-ish-ink-soft">Deal amount (₹)</label>
        <input
          type="text"
          value={dealAmount}
          onChange={(e) => setDealAmount(e.target.value)}
          placeholder="e.g. 1800000 or ₹18,00,000"
          className={cn(
            "mt-1.5 w-full rounded-[14px] border border-ish-border px-3.5 py-2.5 text-[13px] text-ish-ink",
            "outline-none focus:border-ish-black",
          )}
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-auto rounded-[14px] px-4 py-2 text-xs font-semibold"
            onClick={() => {
              setCloseDialogOpen(false);
              setDealAmount("");
            }}
          >
            Cancel
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={submitting || !dealAmount.trim()}
            className="h-auto rounded-[14px] bg-ish-green px-4 py-2 text-xs font-semibold text-white hover:bg-ish-green/90"
            onClick={() => handleManualAdvance("closed", dealAmount)}
          >
            Confirm Close
          </Button>
        </div>
      </AppModal>
    </>
  );
}
