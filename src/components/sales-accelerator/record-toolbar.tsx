"use client";

import { useState } from "react";
import { FileText, MoreHorizontal, RefreshCw, Save, CheckCircle, MessageSquare, Package, Handshake, Trophy, Search, Sparkles } from "lucide-react";
import { Button } from "@/design-system";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { runWriter, markReplied, updateLeadStatus, enrichLead } from "@/lib/api-client";
import type { LeadDetailRecord } from "@/lib/api-client";
import { getNextManualStatus, isContactReadyStage } from "@/lib/pipeline-status";

type Props = {
  lead: LeadDetailRecord;
  onAction: () => void;
  onLeadUpdated: () => void;
};

export function RecordToolbar({ lead, onAction, onLeadUpdated }: Props) {
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [dealAmount, setDealAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [paidDialogOpen, setPaidDialogOpen] = useState(false);

  const needsEnrich =
    !lead.title || lead.title === "—" ||
    !lead.email || lead.email === "—" ||
    lead.emailStatus === "missing" || lead.emailStatus === "generic" ||
    (lead.emailConfidence ?? 0) < 55;

  async function handleEnrich(mode: "free" | "paid") {
    setEnriching(true);
    try {
      const result = await enrichLead(lead.id, { mode });
      if (result.enrichment.title) {
        toast.success(`Title updated: ${result.enrichment.title}`);
      } else if (result.success && result.enrichment.email) {
        toast.success(`Email found (${result.enrichment.confidenceTier})`);
      } else if (result.enrichment.message) {
        toast.info(result.enrichment.message);
      } else {
        toast.info(mode === "paid" ? "Paid enrich completed — no new email found" : "No email found via free sources");
      }
      setPaidDialogOpen(false);
      onAction();
      onLeadUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enrichment failed");
    } finally {
      setEnriching(false);
    }
  }

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
      onAction();
      onLeadUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update status");
    } finally {
      setSubmitting(false);
    }
  }

  const showGenerate = isContactReadyStage(lead.status);
  const showApprove = lead.status === "draft_ready";
  const showMarkReplied = lead.status === "outreached";
  const nextManual = getNextManualStatus(lead.status);

  return (
    <>
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

        {needsEnrich && (
          <Button
            variant="ghost"
            size="sm"
            disabled={enriching}
            className="h-auto rounded-[18px] bg-white/55 px-3.5 py-1.5 text-xs font-semibold text-ish-ink hover:bg-white/70"
            onClick={() => handleEnrich("free")}
          >
            <Search className="size-3.5" />
            Find Email (Free)
          </Button>
        )}

        {needsEnrich && (
          <Button
            variant="ghost"
            size="sm"
            disabled={enriching}
            className="h-auto rounded-[18px] bg-ish-black px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-ish-black/90"
            onClick={() => setPaidDialogOpen(true)}
          >
            <Sparkles className="size-3.5" />
            Enrich (Paid)
          </Button>
        )}

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

        {nextManual === "tasting_sent" && (
          <Button
            variant="ghost"
            size="sm"
            className="h-auto rounded-[18px] bg-ish-black px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-ish-black/90"
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
            className="h-auto rounded-[18px] bg-ish-black px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-ish-black/90"
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
            className="h-auto rounded-[18px] bg-ish-green px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-ish-green/90"
            onClick={() => setCloseDialogOpen(true)}
          >
            <Trophy className="size-3.5" />
            Close Deal
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

      {closeDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[22px] bg-white p-6 shadow-xl">
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
          </div>
        </div>
      )}

      {paidDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[22px] bg-white p-6 shadow-xl">
            <h3 className="text-[15px] font-bold text-ish-ink">Paid enrichment</h3>
            <p className="mt-1 text-[13px] text-ish-ink-soft">
              Uses Apollo and Hunter credits to find a direct email for {lead.name}. This spends paid API quota for this lead only.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-auto rounded-[14px] px-4 py-2 text-xs font-semibold"
                onClick={() => setPaidDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={enriching}
                className="h-auto rounded-[14px] bg-ish-black px-4 py-2 text-xs font-semibold text-white hover:bg-ish-black/90"
                onClick={() => handleEnrich("paid")}
              >
                Run paid enrich
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
