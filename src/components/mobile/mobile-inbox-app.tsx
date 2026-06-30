"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, MessageSquare, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileHeader } from "@/design-system";
import {
  approveOutreach,
  fetchEmailOverview,
  sendOutreach,
  type EmailOverviewData,
} from "@/lib/api-client";
import type { LeadEmailRow } from "@/app/api/email/overview/route";
import { showError } from "@/lib/toast";
import { toast } from "sonner";
import { SwipeInboxCard } from "@/components/mobile/swipe-inbox-card";
import { useInboxBadge } from "@/hooks/use-inbox-badge";
import { hapticLight } from "@/lib/capacitor/platform";

type InboxTab = "needs_review" | "replies";

const TABS: { id: InboxTab; label: string; icon: React.ElementType }[] = [
  { id: "needs_review", label: "Review", icon: FileText },
  { id: "replies", label: "Replies", icon: MessageSquare },
];

export function MobileInboxApp() {
  const [tab, setTab] = useState<InboxTab>("needs_review");
  const [data, setData] = useState<EmailOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { refresh: refreshBadge } = useInboxBadge();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const overview = await fetchEmailOverview();
      setData(overview);
    } catch {
      showError("Couldn't load inbox", { description: "Check your connection and try again." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    if (!data) return [] as LeadEmailRow[];
    return tab === "needs_review" ? data.needsReview : data.replies;
  }, [data, tab]);

  const counts = useMemo(
    () => ({
      needs_review: data?.needsReview.length ?? 0,
      replies: data?.replies.length ?? 0,
    }),
    [data],
  );

  async function handleApprove(row: LeadEmailRow) {
    if (!row.draftOutreachId) {
      toast.message("Open lead to review this draft");
      return;
    }
    setBusyId(row.leadId);
    try {
      const { approvalId } = await approveOutreach({
        leadOutreachId: row.draftOutreachId,
        leadId: row.leadId,
        channel: "email",
        status: "approved",
      });
      void hapticLight();
      toast.success(`Approved · ${row.contactName}`);
      await load();
      refreshBadge();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSend(row: LeadEmailRow) {
    if (!row.draftOutreachId) {
      toast.message("Open lead to send this draft");
      return;
    }
    setBusyId(row.leadId);
    try {
      const { approvalId } = await approveOutreach({
        leadOutreachId: row.draftOutreachId,
        leadId: row.leadId,
        channel: "email",
        status: "approved",
      });
      await sendOutreach(approvalId);
      void hapticLight();
      toast.success(`Sent to ${row.contactName}`);
      await load();
      refreshBadge();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(row: LeadEmailRow) {
    if (!row.draftOutreachId) return;
    setBusyId(row.leadId);
    try {
      await approveOutreach({
        leadOutreachId: row.draftOutreachId,
        leadId: row.leadId,
        channel: "email",
        status: "rejected",
        rejectReason: "mobile_swipe",
      });
      toast.success("Draft rejected");
      await load();
      refreshBadge();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-ish-canvas">
      <MobileHeader
        title="Inbox"
        subtitle="Swipe right to approve, tap Send to deliver"
        rightSlot={
          <button
            type="button"
            onClick={() => void load()}
            className="flex size-10 items-center justify-center rounded-full bg-ish-canvas text-ish-ink active:scale-95"
            aria-label="Refresh inbox"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </button>
        }
      />

      <div className="ish-scroll-tabs overflow-x-auto border-b border-ish-border/60 px-4 py-3">
        <div className="flex min-w-max gap-2">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            const count = counts[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "flex min-h-[40px] items-center gap-2 rounded-full px-4 py-2 text-[13px] font-semibold transition-all active:scale-[0.97]",
                  active ? "bg-ish-black text-white" : "bg-white text-ish-ink-soft shadow-sm",
                )}
              >
                <Icon className="size-4" />
                {label}
                {count > 0 ? (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                      active ? "bg-white/20 text-white" : "bg-ish-stratus-salmon text-white",
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto w-full max-w-2xl space-y-3">
          {loading && !data ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="h-[140px] animate-pulse rounded-[20px] bg-white/80" />
            ))
          ) : rows.length === 0 ? (
            <div className="rounded-[24px] bg-white px-6 py-12 text-center shadow-[var(--shadow-ish-sm)]">
              <div className="text-4xl">{tab === "needs_review" ? "✅" : "💬"}</div>
              <div className="mt-3 text-[15px] font-bold text-ish-ink">
                {tab === "needs_review" ? "Queue is clear" : "Inbox quiet"}
              </div>
              <p className="mt-1 text-[13px] text-ish-ink-soft">
                {tab === "needs_review"
                  ? "No drafts waiting. Scout a lead and write from Leads."
                  : "When someone replies, their thread will appear here."}
              </p>
              <Link
                href="/scouting"
                className="mt-5 inline-flex min-h-[44px] items-center rounded-2xl bg-ish-black px-5 text-[13px] font-semibold text-white active:scale-[0.98]"
              >
                Start scouting
              </Link>
            </div>
          ) : (
            rows.map((row) => (
              <SwipeInboxCard
                key={`${row.leadId}-${row.queueStatus}`}
                row={row}
                tab={tab}
                busy={busyId === row.leadId}
                onApprove={handleApprove}
                onReject={handleReject}
                onSend={handleSend}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
