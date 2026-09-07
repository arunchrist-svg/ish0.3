import { toast } from "sonner";
import type { WhatsAppAutoOpenPayload } from "@/lib/whatsapp/auto-after-second-email";

// Stored on `window` so HMR module reloads don't lose the reference.
const WA_WIN_KEY = "__ish_wa_win__";

function getWaWindow(): Window | null {
  return (window as unknown as Record<string, Window | null>)[WA_WIN_KEY] ?? null;
}
function setWaWindow(w: Window | null) {
  (window as unknown as Record<string, Window | null>)[WA_WIN_KEY] = w;
}

export function openWhatsAppClickUrl(url: string): void {
  const existing = getWaWindow();
  if (existing && !existing.closed) {
    try {
      existing.location.href = url;
      try { existing.focus(); } catch { /* focus may be blocked by browser */ }
      return;
    } catch {
      setWaWindow(null);
    }
  }
  const w = window.open(url, "whatsapp_web") ?? null;
  setWaWindow(w);
  if (!w) window.location.href = url;
}

export function handleWhatsAppAutoOpenResponse(payload?: WhatsAppAutoOpenPayload | null): void {
  if (!payload?.url) return;
  openWhatsAppClickUrl(payload.url);
  toast.success("Opened WhatsApp. Send from the chat to complete the message.", {
    description: payload.to ? `To ${payload.to}` : undefined,
  });
}
