"use client";

import { useState, type ReactNode } from "react";
import type { LeadRecord, QueueItem } from "@/lib/data";
import type { ContactEmailEntry, LeadDetailRecord } from "@/lib/api-client";
import { PanelCard } from "@/design-system";
import { cn } from "@/lib/utils";
import { Building2, Copy, Loader2, MapPin, MessageCircle, Pencil, Phone, Search, Sparkles, Wand2 } from "lucide-react";
import { toWhatsAppUserId } from "@/lib/whatsapp/click-url";
import { Button } from "@/design-system";
import { toast } from "sonner";
import { EmailSuggestModal } from "@/components/sales-accelerator/email-suggest-modal";
import { EmailManageModal } from "@/components/sales-accelerator/email-manage-modal";

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

function isPresent(value?: string | null) {
  return Boolean(value && value !== "—");
}

function tierLabel(tier?: string, confidence?: number) {
  const label =
    tier === "good"
      ? "Good"
      : tier === "generic"
        ? "Generic"
        : tier === "low"
          ? "Low"
          : "Missing";
  return confidence != null && confidence > 0 ? `${label} · ${confidence}` : label;
}

function emailStatusTone(status: string) {
  if (status === "verified") return "text-brand-stratus-blue";
  if (status === "unverified") return "text-brand-ink-faint";
  if (status === "generic") return "text-brand-ink-soft";
  return "text-brand-ink-faint";
}

function testStatusLabel(status?: string) {
  if (status === "sent") return "Sent";
  if (status === "rejected") return "Rejected";
  if (status === "saved") return "Saved";
  return null;
}

function ChannelChip({
  icon,
  label,
  value,
  href,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const inner = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-stratus-blue/12 text-brand-stratus-blue">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">{label}</span>
        <span className="block truncate text-[13px] font-medium text-brand-ink">{value}</span>
      </span>
    </>
  );

  const className =
    "flex w-full items-center gap-2.5 rounded-[14px] border border-brand-border/50 bg-white/70 px-2.5 py-2 shadow-[var(--shadow-brand-sm)] transition hover:border-brand-stratus-blue/35 hover:bg-white";

  if (href) {
    return (
      <a href={href} className={className}>
        {inner}
      </a>
    );
  }

  return <div className={className}>{inner}</div>;
}

function EmailRow({ entry, isPrimary }: { entry: ContactEmailEntry; isPrimary?: boolean }) {
  const testLabel = testStatusLabel(entry.testStatus);
  const statusBits = [
    isPrimary ? "Primary" : null,
    testLabel,
    entry.emailStatus,
    entry.emailConfidence ? String(entry.emailConfidence) : null,
  ].filter(Boolean);

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(entry.email);
      toast.success("Email copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copyEmail()}
      className="flex w-full min-w-0 items-center gap-2.5 py-2 text-left transition hover:bg-white/50"
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          isPrimary ? "bg-brand-stratus-blue shadow-[0_0_6px_rgba(var(--brand-stratus-blue-rgb),0.55)]" : "bg-brand-border",
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium tracking-tight text-brand-ink">{entry.email}</span>
        {statusBits.length ? (
          <span className={cn("mt-0.5 block truncate text-[11px] capitalize", emailStatusTone(entry.emailStatus))}>
            {statusBits.join(" · ")}
          </span>
        ) : null}
      </span>
      <Copy className="size-3 shrink-0 text-brand-ink-faint" />
    </button>
  );
}

function EmailToolButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-7 items-center justify-center text-brand-ink-soft transition hover:text-brand-stratus-blue disabled:opacity-40"
    >
      {children}
    </button>
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
  const [manageOpen, setManageOpen] = useState(false);

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

  const businessPhone = isPresent(record.contact.businessPhone) ? record.contact.businessPhone : "";
  const mobilePhone = isPresent(record.contact.mobilePhone) ? record.contact.mobilePhone : "";
  const city = isPresent(record.company.city) ? record.company.city : "";
  const employees = isPresent(record.company.employees) ? record.company.employees : "";
  const companyName = isPresent(current.company) ? current.company : "";

  return (
    <PanelCard tone="pink" className="p-3 lg:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-ink-faint">Contact</h3>
        <span
          title={enrichmentSource ? `Source: ${enrichmentSource.replace(/_/g, " ")}` : undefined}
          className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-brand-ink-soft shadow-[var(--shadow-brand-sm)]"
        >
          {tierLabel(confidenceTier, emailConfidence)}
        </span>
      </div>

      {(businessPhone || mobilePhone) ? (
        <div className="mb-3 grid gap-2">
          {businessPhone ? (
            <ChannelChip
              icon={<Phone className="size-3.5" />}
              label="Office"
              value={businessPhone}
              href={`tel:${businessPhone.replace(/\s+/g, "")}`}
            />
          ) : null}
          {mobilePhone ? (
            <div className="flex items-center gap-1.5">
              <div className="flex-1">
                <ChannelChip
                  icon={<Phone className="size-3.5" />}
                  label="Mobile"
                  value={mobilePhone}
                  href={`tel:${mobilePhone.replace(/\s+/g, "")}`}
                />
              </div>
              {toWhatsAppUserId(mobilePhone) ? (
                <a
                  href={`https://wa.me/${toWhatsAppUserId(mobilePhone)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open WhatsApp"
                  className="flex size-[52px] shrink-0 items-center justify-center rounded-[14px] border border-[#25D366]/30 bg-[#25D366]/8 text-[#128C40] shadow-[var(--shadow-brand-sm)] transition hover:border-[#25D366]/60 hover:bg-[#25D366]/15"
                >
                  <MessageCircle className="size-4" />
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">Email</div>
          {lead ? (
            <div className="flex items-center divide-x divide-brand-border/70 overflow-hidden rounded-full border border-brand-border/70 bg-white/80 shadow-[var(--shadow-brand-sm)]">
              <EmailToolButton label="Manage emails" onClick={() => setManageOpen(true)}>
                <Pencil className="size-3" />
              </EmailToolButton>
              <EmailToolButton label="Suggest emails" onClick={() => setSuggestOpen(true)}>
                <Wand2 className="size-3" />
              </EmailToolButton>
              {onRefetchEmails ? (
                <>
                  <EmailToolButton
                    label="Find emails"
                    disabled={refetching}
                    onClick={() => void handleRefetch("free")}
                  >
                    {refetching ? <Loader2 className="size-3 animate-spin" /> : <Search className="size-3" />}
                  </EmailToolButton>
                  <EmailToolButton
                    label="Paid enrich"
                    disabled={refetching}
                    onClick={() => void handleRefetch("paid")}
                  >
                    <Sparkles className="size-3" />
                  </EmailToolButton>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        {emailEntries.length ? (
          <div className="divide-y divide-brand-border/45 overflow-hidden rounded-[14px] border border-brand-border/60 bg-white/75 px-3 shadow-[var(--shadow-brand-sm)]">
            {emailEntries.map((entry, index) => (
              <EmailRow key={`${entry.email}-${index}`} entry={entry} isPrimary={index === 0} />
            ))}
          </div>
        ) : (
          <p className="rounded-[14px] border border-dashed border-brand-border/70 bg-white/40 px-3 py-3 text-[12px] text-brand-ink-faint">
            No email yet. Use find or suggest.
          </p>
        )}
      </div>

      {paidDialogOpen ? (
        <div className="mt-3 rounded-[14px] border border-brand-border/60 bg-white/80 p-3 shadow-[var(--shadow-brand-sm)]">
          <p className="text-[12px] text-brand-ink-soft">
            Search Apollo and Hunter for more or better emails for this contact.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="ish-modal-cancel h-auto rounded-xl px-3 py-1.5 text-[11px]"
              onClick={() => setPaidDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ish-scout-cta-blue h-auto rounded-xl px-3 py-1.5 text-[11px] text-white"
              disabled={refetching}
              onClick={() => void confirmPaidRefetch()}
            >
              Run paid enrich
            </Button>
          </div>
        </div>
      ) : null}

      {(companyName || city || employees) ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-brand-border/40 pt-3">
          {companyName ? (
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-medium text-brand-ink shadow-[var(--shadow-brand-sm)]">
              <Building2 className="size-3 shrink-0 text-brand-stratus-blue" />
              <span className="truncate">{companyName}</span>
            </span>
          ) : null}
          {city ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-medium text-brand-ink shadow-[var(--shadow-brand-sm)]">
              <MapPin className="size-3 shrink-0 text-brand-stratus-salmon" />
              {city}
            </span>
          ) : null}
          {employees ? (
            <span className="rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-medium text-brand-ink-soft shadow-[var(--shadow-brand-sm)]">
              {employees}
            </span>
          ) : null}
        </div>
      ) : null}

      {lead ? (
        <>
          <EmailSuggestModal
            open={suggestOpen}
            lead={lead}
            onClose={() => setSuggestOpen(false)}
            onSaved={() => {
              onEmailsSaved?.();
            }}
          />
          <EmailManageModal
            open={manageOpen}
            lead={lead}
            emails={emailEntries}
            onClose={() => setManageOpen(false)}
            onSaved={() => {
              onEmailsSaved?.();
            }}
          />
        </>
      ) : null}
    </PanelCard>
  );
}
