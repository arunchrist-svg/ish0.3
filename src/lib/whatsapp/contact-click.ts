import { sanitizeWhatsAppCopy } from "@/lib/whatsapp/outreach";

export function contactFirstName(name: string, firstName?: string | null): string {
  const explicit = firstName?.trim();
  if (explicit) return explicit.split(/\s+/)[0] ?? explicit;
  const word = name.trim().split(/\s+/)[0] ?? "";
  return word || "there";
}

/** Short ISH tasting opener for click-to-chat from the contacts list. */
export function buildContactWhatsAppMessage(params: {
  name: string;
  firstName?: string | null;
  company?: string | null;
}): string {
  const first = contactFirstName(params.name, params.firstName);
  const company = params.company?.trim();
  const companyBit = company ? ` for teams like ${company}` : "";
  return sanitizeWhatsAppCopy(
    `Hi ${first},\n\nI'm Prasant from India Sweet House. We put together festive mithai and corporate hampers${companyBit}.\n\nOpen to a tasting sample for your office?`,
  );
}
