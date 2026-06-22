"use client";

import { useState } from "react";
import { FileText, Loader2, Mail, Package, Phone, RefreshCw, Search, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UpNextTask } from "@/lib/data";
import { Button, CircleButton, PanelCard, SectionHeader } from "@/design-system";
import { enrichLead } from "@/lib/api-client";
import type { LeadDetailRecord } from "@/lib/api-client";
import { isContactReadyStage } from "@/lib/pipeline-status";
import { AppModal } from "@/components/ui/app-modal";
import { toast } from "sonner";
import { ActionLoader } from "@/components/sales-accelerator/action-loader";

const iconMap = {
  package: Package,
  phone: Phone,
  file: FileText,
  mail: Mail,
};

function needsEnrich(lead: LeadDetailRecord) {
  return (
    !lead.title || lead.title === "—" ||
    !lead.email || lead.email === "—" ||
    lead.emailStatus === "missing" || lead.emailStatus === "generic" ||
    (lead.emailConfidence ?? 0) < 55
  );
}

function ActionCard({
  title,
  step,
  desc,
  icon: Icon,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  secondaryLabel,
  onSecondary,
  secondaryDisabled,
}: {
  title: string;
  step: string;
  desc: string;
  icon: typeof Mail;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  secondaryDisabled?: boolean;
}) {
  return (
    <div className="mb-2.5 rounded-2xl bg-ish-yellow-gradient p-4 shadow-[var(--shadow-ish-yellow-sm)]">
      <div className="mb-2.5 flex gap-3">
        <div className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-ish-black text-sm text-white">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-bold leading-snug text-ish-ink">{title}</div>
          <div className="mt-0.5 text-[11px] text-ish-ink-soft">{step}</div>
        </div>
      </div>
      <div className="mb-3 text-[12.5px] leading-snug text-ish-ink">{desc}</div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={primaryDisabled}
          className="h-auto shrink-0 rounded-xl bg-ish-black px-3 py-2 text-[11px] font-semibold text-white hover:bg-ish-black/90"
          onClick={onPrimary}
        >
          {primaryDisabled ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin" />
          ) : (
            <Icon className="size-3.5 shrink-0" />
          )}
          {primaryDisabled ? "Working…" : primaryLabel}
        </Button>
        {secondaryLabel && onSecondary && (
          <Button
            size="sm"
            variant="ghost"
            disabled={secondaryDisabled}
            className="h-auto shrink-0 rounded-xl bg-white/60 px-3 py-2 text-[11px] font-semibold text-ish-ink hover:bg-white/80"
            onClick={onSecondary}
          >
            <Sparkles className="size-3.5 shrink-0" />
            {secondaryLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

function TaskCard({
  task,
  hasEmailDraft,
  onOpenEmailTab,
}: {
  task: UpNextTask;
  hasEmailDraft: boolean;
  onOpenEmailTab: () => void;
}) {
  const Icon = iconMap[task.icon] ?? Mail;
  const isMail = task.icon === "mail";

  return (
    <div
      className={cn(
        "mb-2.5 rounded-2xl p-4",
        task.active ? "bg-ish-yellow-gradient shadow-[var(--shadow-ish-yellow-sm)]" : "bg-white shadow-[var(--shadow-ish-sm)]",
      )}
    >
      <div className={cn("flex gap-3", task.active ? "mb-2.5" : "")}>
        <div
          className={cn(
            "flex size-[34px] shrink-0 items-center justify-center rounded-full text-sm",
            task.active ? "bg-ish-black text-white" : "bg-[#f2f1f4] text-ish-ink-soft",
          )}
        >
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-bold leading-snug text-ish-ink">{task.title}</div>
          <div className="mt-0.5 text-[11px] text-ish-ink-soft">{task.step}</div>
          {!task.active && <div className="mt-1 text-[11.5px] text-ish-ink-faint">{task.desc}</div>}
        </div>
      </div>
      {task.active && (
        <>
          <div className="mb-3 text-[12.5px] leading-snug text-ish-ink">{task.desc}</div>
          <div className="flex flex-wrap gap-2">
            {isMail ? (
              <Button
                size="sm"
                className="h-auto shrink-0 rounded-xl bg-ish-black px-3 py-2 text-[11px] font-semibold text-white hover:bg-ish-black/90"
                onClick={onOpenEmailTab}
              >
                <Mail className="size-3.5 shrink-0" />
                {hasEmailDraft ? "Review Email" : "Write Email"}
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  className="h-auto shrink-0 rounded-xl bg-ish-black px-3 py-2 text-[11px] font-semibold text-white hover:bg-ish-black/90"
                  onClick={() => toast.success("Action started")}
                >
                  <Package className="size-3.5 shrink-0" />
                  {task.icon === "package" ? "Ship Box" : "Call"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-auto shrink-0 rounded-xl bg-white/60 px-3 py-2 text-[11px] font-semibold text-ish-ink hover:bg-white/80"
                  onClick={() => toast.success(task.primaryAction ?? "Marked complete")}
                >
                  {task.primaryAction ?? "Mark Complete"}
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

type Props = {
  tasks: UpNextTask[];
  lead: LeadDetailRecord;
  hasEmailDraft: boolean;
  onOpenEmailTab: () => void;
  onLeadUpdated: () => void;
  onRefresh: (showOverlay?: boolean) => void | Promise<void>;
};

export function UpNextPanel({ tasks, lead, hasEmailDraft, onOpenEmailTab, onLeadUpdated, onRefresh }: Props) {
  const [enriching, setEnriching] = useState(false);
  const [panelRefreshing, setPanelRefreshing] = useState(false);
  const [paidDialogOpen, setPaidDialogOpen] = useState(false);

  const showEnrich = needsEnrich(lead);
  const showWriteEmail = !showEnrich && !hasEmailDraft && isContactReadyStage(lead.status);
  const showReviewEmail = !showEnrich && hasEmailDraft && lead.status === "draft_ready";

  const mailTaskTitles = new Set([
    "Generate Email Draft",
    "Review & Approve Email",
    "Write outreach email",
    "Review email draft",
    "Find contact email",
  ]);
  const filteredTasks = tasks.filter((t) => {
    if (showEnrich || showWriteEmail || showReviewEmail) {
      if (mailTaskTitles.has(t.title)) return false;
    }
    return true;
  });

  async function handlePanelRefresh() {
    setPanelRefreshing(true);
    try {
      await onRefresh(true);
    } finally {
      setPanelRefreshing(false);
    }
  }

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
      await onRefresh(false);
      onLeadUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Enrichment failed");
    } finally {
      setEnriching(false);
    }
  }

  return (
    <PanelCard tone="yellow">
      <SectionHeader
        title="Up Next"
        className="mb-3.5"
        actions={(
          <CircleButton size={28} onClick={() => void handlePanelRefresh()}>
            <RefreshCw className={cn("size-3.5", panelRefreshing && "animate-spin")} />
          </CircleButton>
        )}
      />

      {showEnrich && enriching ? (
        <div className="mb-2.5 rounded-2xl bg-ish-yellow-gradient shadow-[var(--shadow-ish-yellow-sm)]">
          <ActionLoader variant="enrich" contactName={lead.name} compact />
        </div>
      ) : showEnrich ? (
        <ActionCard
          title="Find contact email"
          step="Step 1 · Ready now"
          desc="Find a verified email before writing outreach"
          icon={Search}
          primaryLabel="Find Email (Free)"
          onPrimary={() => handleEnrich("free")}
          primaryDisabled={enriching}
          secondaryLabel="Enrich (Paid)"
          onSecondary={() => setPaidDialogOpen(true)}
          secondaryDisabled={enriching}
        />
      ) : null}

      {showWriteEmail && (
        <ActionCard
          title="Write outreach email"
          step="Step 1 · Ready now"
          desc="Write a personalized outreach email for this contact"
          icon={Mail}
          primaryLabel="Write Email"
          onPrimary={onOpenEmailTab}
        />
      )}

      {showReviewEmail && (
        <ActionCard
          title="Review email draft"
          step="Step 1 · Awaiting your approval"
          desc="Check the draft and approve or reject"
          icon={Mail}
          primaryLabel="Review Email"
          onPrimary={onOpenEmailTab}
        />
      )}

      {filteredTasks.map((task) => (
        <TaskCard key={task.title} task={task} hasEmailDraft={hasEmailDraft} onOpenEmailTab={onOpenEmailTab} />
      ))}

      <AppModal open={paidDialogOpen} onClose={() => setPaidDialogOpen(false)}>
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
      </AppModal>
    </PanelCard>
  );
}
