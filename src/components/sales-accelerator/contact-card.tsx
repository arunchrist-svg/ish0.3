import type { LeadRecord, QueueItem } from "@/lib/data";
import { FieldRow, PanelCard, SectionHeader } from "@/design-system";

type Props = {
  record: LeadRecord;
  current: QueueItem;
};

export function ContactCard({ record, current }: Props) {
  return (
    <PanelCard tone="pink">
      <SectionHeader title="Contact" className="mb-4" />
      <FieldRow label="Topic" value={record.contact.topic} />
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
