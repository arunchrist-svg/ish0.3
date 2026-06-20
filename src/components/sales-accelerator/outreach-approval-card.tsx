"use client";

import { useState } from "react";
import { CheckCircle, XCircle, AlertCircle, Send, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { approveOutreach, sendOutreach } from "@/lib/api-client";
import type { WriterDraft } from "@/lib/api-client";
import { toast } from "sonner";

const REJECT_REASONS = [
  "Wrong tone",
  "Too long",
  "Wrong contact",
  "Wrong product mention",
  "Bad subject line",
  "Other",
];

type Props = {
  leadId: string;
  draft: WriterDraft;
  onDone: () => void;
};

export function OutreachApprovalCard({ leadId, draft, onDone }: Props) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [subjectUsed, setSubjectUsed] = useState<"A" | "B">("A");
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState(draft.approvalStatus);

  const verdictColor =
    draft.deliverabilityVerdict === "PASS"
      ? "text-ish-green"
      : draft.deliverabilityVerdict === "MARGINAL"
      ? "text-[#e8a000]"
      : "text-red-500";

  const rubric = draft.rubricScore ?? {};

  async function handleApprove() {
    setLoading(true);
    try {
      const result = await approveOutreach({
        leadOutreachId: draft.id,
        leadId,
        channel: "email",
        status: "approved",
        subjectUsed: subjectUsed === "A" ? draft.subjectA : draft.subjectB,
      });
      setLocalStatus("approved");
      // Type cast — approveOutreach returns void but server sends approvalId
      const r = result as unknown as { approvalId?: string };
      if (r?.approvalId) setApprovalId(r.approvalId);
      toast.success("Approved — click Send to dispatch email");
      onDone();
    } catch {
      toast.error("Approval failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSend() {
    if (!approvalId) { toast.info("Approve the draft first"); return; }
    setLoading(true);
    try {
      const result = await sendOutreach(approvalId);
      toast.success(
        result.mode === "dry_run"
          ? "Dry-run: email logged (not sent)"
          : result.mode === "test"
          ? `Test email sent to ${process.env.NEXT_PUBLIC_TEST_RECIPIENT ?? "test inbox"}`
          : "Email sent!",
      );
      onDone();
    } catch {
      toast.error("Send failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    if (!rejectReason) { toast.info("Select a reject reason first"); return; }
    setLoading(true);
    try {
      await approveOutreach({
        leadOutreachId: draft.id,
        leadId,
        channel: "email",
        status: "rejected",
        rejectReason,
        rejectNote,
      });
      setLocalStatus("rejected");
      toast.info("Draft rejected — regenerate to try again");
      onDone();
    } catch {
      toast.error("Reject failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="approval-card" className="rounded-[20px] border border-ish-border bg-white p-5 shadow-[var(--shadow-ish-sm)]">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-ish-yellow">
            <Mail className="size-4 text-ish-ink" />
          </div>
          <div>
            <div className="text-[13px] font-bold text-ish-ink">Email Outreach Draft</div>
            <div className="text-[11px] text-ish-ink-faint">
              {draft.draftSource} · {draft.promptVersion} · {draft.revisionCount ?? 0} revision{draft.revisionCount !== 1 ? "s" : ""}
              {draft.revisionTimeout && <span className="ml-1 text-[#e8a000]">(revision timeout)</span>}
            </div>
          </div>
        </div>
        <div className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-bold", verdictColor)}>
          <AlertCircle className="size-3.5" />
          {draft.deliverabilityVerdict ?? "—"} ({draft.deliverabilityScore ?? "—"}/100)
        </div>
      </div>

      {/* Rubric scores */}
      {draft.rubricTotal && draft.rubricTotal > 0 && (
        <div className="mb-4 grid grid-cols-4 gap-2">
          {Object.entries(rubric).map(([dim, score]) => (
            <div key={dim} className="rounded-[12px] bg-ish-app p-2.5 text-center">
              <div className="text-[18px] font-bold text-ish-ink">{score}</div>
              <div className="text-[10px] text-ish-ink-faint capitalize">{dim.replace(/_/g, " ")}</div>
            </div>
          ))}
          <div className="col-span-4 rounded-[12px] bg-ish-yellow/20 p-2 text-center">
            <span className="text-[12px] font-bold text-ish-ink">Total: {draft.rubricTotal}/100</span>
          </div>
        </div>
      )}

      {/* Subject selector */}
      <div className="mb-3 flex gap-2">
        {(["A", "B"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setSubjectUsed(v)}
            className={cn(
              "flex-1 rounded-[12px] border p-2.5 text-left text-[12px] transition-all",
              subjectUsed === v
                ? "border-ish-ink bg-ish-black text-white"
                : "border-ish-border bg-white text-ish-ink hover:bg-ish-app",
            )}
          >
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide opacity-60">
              Subject {v}
            </span>
            {v === "A" ? (draft.subjectA ?? "—") : (draft.subjectB ?? "—")}
          </button>
        ))}
      </div>

      {/* Email body */}
      <div className="mb-4 rounded-[14px] bg-ish-app p-4">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-ish-ink-faint">Body</div>
        <pre className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ish-ink">
          {draft.emailBody ?? "(No body generated)"}
        </pre>
      </div>

      {/* Actions */}
      {localStatus === "pending" && !rejecting && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-[14px] bg-ish-green py-2.5 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            <CheckCircle className="size-4" />
            Approve
          </button>
          <button
            type="button"
            onClick={() => setRejecting(true)}
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-[14px] border border-ish-border py-2.5 text-[13px] font-bold text-ish-ink hover:bg-ish-app disabled:opacity-50"
          >
            <XCircle className="size-4" />
            Reject
          </button>
        </div>
      )}

      {localStatus === "approved" && (
        <div className="space-y-2">
          <div className="rounded-[14px] bg-ish-green/10 py-2.5 text-center text-[13px] font-bold text-ish-green">
            ✓ Approved — Sequencer scheduled Day 4 / 8 / 14 follow-ups
          </div>
          <button
            type="button"
            onClick={handleSend}
            disabled={loading || !approvalId}
            className="flex w-full items-center justify-center gap-2 rounded-[14px] bg-ish-black py-2.5 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            <Send className="size-4" />
            {loading ? "Sending…" : "Send Email Now"}
          </button>
        </div>
      )}

      {rejecting && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {REJECT_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRejectReason(r)}
                className={cn(
                  "rounded-full px-3 py-1 text-[11.5px] font-semibold transition-all",
                  rejectReason === r
                    ? "bg-ish-black text-white"
                    : "bg-ish-app text-ish-ink hover:bg-ish-border",
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <textarea
            placeholder="Optional note (helps improve next draft)"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            className="w-full rounded-[12px] border border-ish-border bg-ish-app px-3 py-2 text-[12px] text-ish-ink outline-none focus:border-ish-ink"
            rows={2}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleReject}
              disabled={loading}
              className="flex-1 rounded-[14px] bg-red-500 py-2.5 text-[13px] font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              Confirm Reject
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="flex-1 rounded-[14px] border border-ish-border py-2.5 text-[13px] font-bold text-ish-ink hover:bg-ish-app"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {localStatus === "rejected" && (
        <div className="rounded-[14px] bg-red-50 py-3 text-center text-[13px] font-bold text-red-500">
          ✗ Rejected — Click Generate Email to create a new draft
        </div>
      )}
    </div>
  );
}
