import type { LeadRecord, QueueItem } from "@/lib/data";
import { FieldRow, PanelCard, SectionHeader } from "@/design-system";
import { cn } from "@/lib/utils";

type Props = {
  record: LeadRecord;
  current: QueueItem;
  emailConfidence?: number;
  confidenceTier?: string;
  enrichmentSource?: string;
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

export function ContactCard({ record, current, emailConfidence, confidenceTier, enrichmentSource }: Props) {
  return (
    <PanelCard tone="pink">
      <div className="mb-4 flex items-center justify-between gap-2">
        <SectionHeader title="Contact" className="mb-0" />
        {tierBadge(confidenceTier, emailConfidence)}
      </div>
      {enrichmentSource ? (
        <p className="mb-3 text-[10.5px] text-ish-ink-faint">Source: {enrichmentSource.replace(/_/g, " ")}</p>
      ) : null}
      <FieldRow label="First Name" value={record.contact.firstName} />
      <FieldRow label="Last Name" value={record.contact.lastName} />
      <FieldRow label="Job Title" value={current.title} />
      <FieldRow label="Business Phone" value={record.contact.businessPhone} action="phone" />
      <FieldRow label="Mobile Phone" value={record.contact.mobilePhone} action="phone" />
      <FieldRow label="Email" value={record.contact.email} action="mail" />
      <SectionHeader title="Company" className="mb-3 mt-5" />
      <FieldRow label="Company" value={current.company} />
      <FieldRow label="Employees" value={record.company.employees} />
      <FieldRow label="City" value={record.company.city} />
    </PanelCard>
  );
}
