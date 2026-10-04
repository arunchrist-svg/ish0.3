import { sanitizePhone } from "@/lib/enrichment/validate-contact";

/** Indian mobile as WhatsApp user id: 91 + 10 digits. */
export function toWhatsAppUserId(phone: string | null | undefined): string | null {
  const digits = sanitizePhone(phone);
  return digits ? `91${digits}` : null;
}

/** E.164 for logging: +91XXXXXXXXXX. */
export function toWhatsAppE164(phone: string | null | undefined): string | null {
  const userId = toWhatsAppUserId(phone);
  return userId ? `+${userId}` : null;
}

export function formatWhatsAppDisplay(phone: string | null | undefined): string | null {
  const digits = sanitizePhone(phone);
  if (!digits) return null;
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
}

export function buildWhatsAppClickUrl(phone: string, text: string): string {
  const userId = toWhatsAppUserId(phone);
  if (!userId) throw new Error("Invalid mobile number");
  const body = text.trim();
  if (!body) throw new Error("WhatsApp message is empty");
  return `https://wa.me/${userId}?text=${encodeURIComponent(body)}`;
}
