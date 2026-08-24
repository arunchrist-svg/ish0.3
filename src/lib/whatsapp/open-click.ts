import { toast } from "sonner";
import type { WhatsAppAutoOpenPayload } from "@/lib/whatsapp/auto-after-second-email";

export function openWhatsAppClickUrl(url: string): void {
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) window.location.href = url;
}

export function handleWhatsAppAutoOpenResponse(payload?: WhatsAppAutoOpenPayload | null): void {
  if (!payload?.url) return;
  openWhatsAppClickUrl(payload.url);
  toast.success("Opened WhatsApp. Send from the chat to complete the message.", {
    description: payload.to ? `To ${payload.to}` : undefined,
  });
}
