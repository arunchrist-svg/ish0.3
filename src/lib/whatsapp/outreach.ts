export const WHATSAPP_TEMPLATE_VARIANT = "whatsapp";
export const WHATSAPP_PROMPT_VERSION = "v1.0-whatsapp";
export const WHATSAPP_CHANNEL = "whatsapp";

export function isWhatsAppOutreach(row: { templateVariant?: string | null } | null | undefined): boolean {
  return row?.templateVariant === WHATSAPP_TEMPLATE_VARIANT;
}

export function isEmailOutreachRow(row: { templateVariant?: string | null }): boolean {
  return !isWhatsAppOutreach(row);
}

export function sanitizeWhatsAppCopy(raw: string): string {
  return raw
    .replace(/\u2014/g, ", ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
