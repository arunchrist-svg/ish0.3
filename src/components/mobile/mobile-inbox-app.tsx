"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Inbox, MessageSquare, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppPageHeader, EmptyState, MobilePageLayout, ScrollableTabs } from "@/design-system";
import { SkeletonList } from "@/design-system";
import {
  approveOutreach,
  fetchEmailOverview,
  sendFollowUp,
  sendOutreach,
  type EmailOverviewData,
} from "@/lib/api-client";
import { sendWithGateConfirm } from "@/lib/outreach/send-with-gate-confirm";
import { handleWhatsAppAutoOpenResponse } from "@/lib/whatsapp/open-click";
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

function isFollowUpRow(row: LeadEmailRow): boolean {
  return Boolean(row.pendingFollowUpScheduleId || row.isFollowUpReview);
}

export function MobileInboxApp() {
  const [tab, setTab] = useState<InboxTab>("needs_review");
  const [data, setData] = useState<EmailOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { refresh: refreshBadge } = useInboxBadge();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const overview = await fetchEmailOverview(["needs_review", "replies"]);
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
      needs_review: data?.stats.tabCounts?.needs_review ?? data?.needsReview.length ?? 0,
      replies: data?.stats.tabCounts?.replies ?? data?.replies.length ?? 0,
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
      await approveOutreach({
        leadOutreachId: row.draftOutreachId,
        leadId: row.leadId,
        channel: "email",
        status: "approved",
      });
      void hapticLight();
      toast.success(
        isFollowUpRow(row)
          ? `Follow-up approved · ${row.contactName}`
          : `Approved · ${row.contactName}`,
      );
      await load();
      refreshBadge();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleSend(row: LeadEmailRow) {
    const followUp = isFollowUpRow(row);
    if (followUp && !row.pendingFollowUpScheduleId) {
      toast.message("Open lead to send this follow-up");
      return;
    }
    if (!followUp && !row.draftOutreachId) {
      toast.message("Open lead to send this draft");
      return;
    }

    setBusyId(row.leadId);
    try {
      if (followUp && row.pendingFollowUpScheduleId) {
        const result = await sendWithGateConfirm((overrides) =>
          sendFollowUp(row.pendingFollowUpScheduleId!, overrides),
        );
        void hapticLight();
        toast.success(`Follow-up sent to ${row.contactName}`);
        handleWhatsAppAutoOpenResponse(result.whatsappOpen);
      } else if (row.draftOutreachId) {
        const { approvalId } = await approveOutreach({
          leadOutreachId: row.draftOutreachId,
          leadId: row.leadId,
          channel: "email",
          status: "approved",
        });
        await sendWithGateConfirm((overrides) => sendOutreach(approvalId, overrides));
        void hapticLight();
        toast.success(`Sent to ${row.contactName}`);
      }
      await load();
      refreshBadge();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusyId(null);
    }
  }

  const tabLabels = TABS.map((t) => t.label);
  const tabValues = TABS.map((t) => t.id);
  const activeLabel = TABS.find((t) => t.id === tab)?.label ?? "Review";
  const tabCounts = Object.fromEntries(
    TABS.map((t) => [t.label, counts[t.id]]),
  );

  return (
    <MobilePageLayout
      title="Inbox"
      largeTitle={false}
      className="ish-inbox-page"
      rightSlot={
        <button
          type="button"
          onClick={() => void load()}
          className="flex size-10 items-center justify-center rounded-full bg-white/90 text-brand-ink shadow-ish ring-1 ring-brand-border/40 active:scale-95"
          aria-label="Refresh inbox"
        >
          <RefreshCw className={cn("size-4 text-brand-stratus-blue", loading && "animate-spin")} />
        </button>
      }
      contentClassName="!pb-0 ish-inbox-page"
    >
      <AppPageHeader
        icon={Inbox}
        title="Inbox"
        actions={
          <button
            type="button"
            onClick={() => void load()}
            className="flex size-9 items-center justify-center rounded-full border border-brand-border/70 bg-white/70 text-brand-ink-soft transition-all hover:border-brand-ink/20 hover:text-brand-ink active:scale-95"
            aria-label="Refresh inbox"
          >
            <RefreshCw className={cn("size-3.5 text-brand-stratus-blue", loading && "animate-spin")} />
          </button>
        }
      />
      <div className="border-b border-brand-border/40 bg-white/60 ish-page-padding py-2 backdrop-blur-xl">
        <ScrollableTabs
          tabs={tabLabels}
          value={activeLabel}
          counts={tabCounts}
          compact
          onChange={(label) => {
            const idx = tabLabels.indexOf(label);
            if (idx >= 0) setTab(tabValues[idx] as InboxTab);
          }}
        />
      </div>

      <div className="ish-page-padding py-4">
        <div className="mx-auto w-full max-w-2xl space-y-4">
          {loading && !data ? (
            <SkeletonList rows={4} />
          ) : rows.length === 0 ? (
            <div className="rounded-[24px] border border-brand-border/50 bg-white/80 px-6 py-14 text-center shadow-ish backdrop-blur-xl">
              <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-brand-yellow-gradient shadow-brand-yellow-sm">
                <Inbox className="size-7 text-brand-black" />
              </div>
              <EmptyState
                title={tab === "needs_review" ? "Queue is clear" : "Inbox quiet"}
                description={
                  tab === "needs_review"
                    ? "No drafts waiting. Scout a lead and write from Leads."
                    : "When someone replies, their thread will appear here."
                }
                action={
                  <Link
                    href="/scouting"
                    className="inline-flex h-12 items-center rounded-2xl bg-brand-yellow-gradient px-6 text-[15px] font-bold text-brand-black shadow-brand-yellow-sm active:scale-[0.98]"
                  >
                    Start scouting
                  </Link>
                }
                className="py-0"
              />
            </div>
          ) : (
            rows.map((row, i) => (
              <SwipeInboxCard
                key={`${row.leadId}-${row.queueStatus}-${row.pendingFollowUpScheduleId ?? "e1"}`}
                row={row}
                tab={tab}
                index={i}
                busy={busyId === row.leadId}
                onApprove={handleApprove}
                onSend={handleSend}
              />
            ))
          )}
        </div>
      </div>
    </MobilePageLayout>
  );
}
