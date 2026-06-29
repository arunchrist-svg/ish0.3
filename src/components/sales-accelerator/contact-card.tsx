"use client";

import { useState } from "react";
import type { LeadRecord, QueueItem } from "@/lib/data";
import type { ContactEmailEntry, LeadDetailRecord } from "@/lib/api-client";
import { FieldRow, PanelCard, SectionHeader } from "@/design-system";
import { cn } from "@/lib/utils";
import { Loader2, Mail, Search, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/design-system";
import { EmailSuggestModal } from "@/components/sales-accelerator/email-suggest-modal";

type Props = {
  record: LeadRecord;
  current: QueueItem;
  lead?: LeadDetailRecord;
  emails?: ContactEmailEntry[];
  emailConfidence?: number;
  confidenceTier?: string;
  enrichmentSource?: string;
  onRefetchEmails?: (mode: "free" | "paid") => Promise<void>;
  onEmailsSaved?: () => void;
};

function tierBadge(tier?: string, confidence?: number) {
  const label =
    tier === "good"
      ? "Good"
      : tier === "generic"
        ? "Generic"
        : tier === "low"
          ? "Low"
          : "Missing";
  const tone =
    tier === "good"
      ? "bg-ish-green-soft text-ish-green"
      : tier === "generic"
        ? "bg-ish-yellow-soft text-ish-ink-soft"
        : tier === "low"
          ? "bg-orange-50 text-orange-700"
          : "bg-ish-border/60 text-ish-ink-faint";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", tone)}>
      {label}
      {confidence != null && confidence > 0 ? ` · ${confidence}` : ""}
    </span>
  );
}

function emailStatusTone(status: string) {
  if (status === "verified") return "text-ish-green";
  if (status === "unverified") return "text-[#e8a000]";
  if (status === "generic") return "text-ish-ink-soft";
  return "text-ish-ink-faint";
}


function testStatusBadge(status?: string) {
  const label =
    status === "sent" ? "Sent" : status === "rejected" ? "Rejected" : status === "saved" ? "Saved" : null;
  if (!label) return null;
  const tone =
    status === "sent"
      ? "bg-ish-green-soft text-ish-green"
      : status === "rejected"
        ? "bg-red-50 text-red-700"
        : "bg-ish-yellow-soft text-[#e8a000]";
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide", tone)}>
      {label}
    </span>
  );
}

function EmailRow({
  entry,
  isPrimary,
  onRefetch,
  refetching,
}: {
  entry: ContactEmailEntry;
  isPrimary?: boolean;
  onRefetch?: (mode: "free" | "paid") => Promise<void>;
  refetching: boolean;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-[13px] text-ish-ink">{entry.email}</span>
            {isPrimary ? (
              <span className="rounded-full bg-ish-black/8 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ish-ink-soft">
                Primary
              </span>
            ) : null}
            {testStatusBadge(entry.testStatus)}
            {entry.pattern ? (
              <span className="rounded-full bg-ish-black/6 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ish-ink-soft">
                {entry.pattern}
              </span>
            ) : null}
          </div>
          <div className={cn("mt-0.5 text-[10.5px] capitalize", emailStatusTone(entry.emailStatus))}>
            {entry.emailStatus}
            {entry.emailConfidence ? ` · ${entry.emailConfidence}` : ""}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {onRefetch ? (
            <>
              <button
                type="button"
                title="Refetch email (free)"
                disabled={refetching}
                onClick={() => void onRefetch("free")}
                className="flex size-7 items-center justify-center rounded-full bg-white/70 text-ish-ink-soft transition hover:bg-white hover:text-ish-ink disabled:opacity-50"
              >
                {refetching ? <Loader2 className="size-3 animate-spin" /> : <Search className="size-3" />}
              </button>
              <button
                type="button"
                title="Refetch email (paid)"
                disabled={refetching}
                onClick={() => void onRefetch("paid")}
                className="flex size-7 items-center justify-center rounded-full bg-white/70 text-ish-ink-soft transition hover:bg-white hover:text-ish-ink disabled:opacity-50"
              >
                <Sparkles className="size-3" />
              </button>
            </>
          ) : (
            <Mail className="size-3.5 text-ish-ink-faint" />
          )}
        </div>
      </div>
    </div>
  );
}

export function ContactCard({
  record,
  current,
  lead,
  emails = [],
  emailConfidence,
  confidenceTier,
  enrichmentSource,
  onRefetchEmails,
  onEmailsSaved,
}: Props) {
  const [refetching, setRefetching] = useState(false);
  const [paidDialogOpen, setPaidDialogOpen] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);

  async function handleRefetch(mode: "free" | "paid") {
    if (!onRefetchEmails) return;
    if (mode === "paid") {
      setPaidDialogOpen(true);
      return;
    }
    setRefetching(true);
    try {
      await onRefetchEmails("free");
    } finally {
      setRefetching(false);
    }
  }

  async function confirmPaidRefetch() {
    if (!onRefetchEmails) return;
    setRefetching(true);
    try {
      await onRefetchEmails("paid");
      setPaidDialogOpen(false);
    } finally {
      setRefetching(false);
    }
  }

  const emailEntries = emails.length
    ? emails
    : record.contact.email && record.contact.email !== "—"
      ? [{ email: record.contact.email, emailStatus: "missing" as const }]
      : [];

  return (
    <PanelCard tone="pink">
      <div className="mb-4 flex items-center justify-between gap-2">
        <SectionHeader title="Contact" className="mb-0" />
        {tierBadge(confidenceTier, emailConfidence)}
      </div>
      {enrichmentSource ? (
        <p className="mb-3 text-[10.5px] text-ish-ink-faint">Source: {enrichmentSource.replace(/_/g, " ")}</p>
      ) : null}
      <FieldRow
        label="Name"
        value={[record.contact.firstName, record.contact.lastName].filter(Boolean).join(" ") || "—"}
      />
      <FieldRow label="Job Title" value={current.title} />
      <FieldRow label="Business Phone" value={record.contact.businessPhone} action="phone" />
      <FieldRow label="Mobile Phone" value={record.contact.mobilePhone} action="phone" />
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className={cn("text-[11px] font-semibold uppercase tracking-wide text-ish-ink-faint")}>Email</div>
          {lead ? (
            <button
              type="button"
              title="Suggest emails from name and domain"
              onClick={() => setSuggestOpen(true)}
              className="flex items-center gap-1 rounded-full bg-white/70 px-2 py-1 text-[10px] font-semibold text-ish-ink-soft transition hover:bg-white hover:text-ish-ink"
            >
              <Wand2 className="size-3" />
              Suggest
            </button>
          ) : null}
        </div>
        {emailEntries.length ? (
          emailEntries.map((entry, index) => (
            <EmailRow
              key={`${entry.email}-${index}`}
              entry={entry}
              isPrimary={index === 0}
              onRefetch={onRefetchEmails ? handleRefetch : undefined}
              refetching={refetching}
            />
          ))
        ) : (
          <div className="text-[13px] text-ish-ink">—</div>
        )}
      </div>
      {paidDialogOpen ? (
        <div className="mb-4 rounded-xl border border-ish-border/60 bg-white/70 p-3">
          <p className="text-[12px] text-ish-ink-soft">
            Run paid enrichment to search Apollo/Hunter for more or better emails for this contact.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-auto rounded-xl px-3 py-1.5 text-[11px]"
              onClick={() => setPaidDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-auto rounded-xl bg-ish-black px-3 py-1.5 text-[11px] text-white"
              disabled={refetching}
              onClick={() => void confirmPaidRefetch()}
            >
              Run paid enrich
            </Button>
          </div>
        </div>
      ) : null}
      <SectionHeader title="Company" className="mb-3 mt-5" />
      <FieldRow label="Company" value={current.company} />
      <FieldRow label="Employees" value={record.company.employees} />
      <FieldRow label="City" value={record.company.city} />
      {lead ? (
        <EmailSuggestModal
          open={suggestOpen}
          lead={lead}
          onClose={() => setSuggestOpen(false)}
          onSaved={() => {
            onEmailsSaved?.();
          }}
        />
      ) : null}
    </PanelCard>
  );
}
