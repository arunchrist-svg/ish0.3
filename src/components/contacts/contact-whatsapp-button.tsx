"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  markContactWhatsAppSent,
  openContactWhatsApp,
  type ContactListItem,
} from "@/lib/api-client";
import { openWhatsAppClickUrl } from "@/lib/whatsapp/open-click";
import { toast } from "sonner";

function WhatsAppGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.23 8.23 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23-1.48 0-2.93-.39-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24m-3.46 4.39c-.17 0-.44.06-.67.31-.23.26-.87.85-.87 2.07 0 1.22.89 2.39 1.01 2.56.12.17 1.75 2.67 4.23 3.74 2.05.89 2.47.71 2.92.67.45-.04 1.45-.59 1.65-1.16.2-.57.2-1.05.14-1.16-.06-.1-.23-.17-.48-.3-.25-.12-1.47-.73-1.7-.81-.23-.08-.39-.12-.56.12-.17.25-.65.81-.8.97-.15.17-.3.19-.55.06-.25-.12-1.06-.39-2.02-1.25-.75-.66-1.25-1.48-1.4-1.73-.15-.25-.02-.39.11-.51.12-.12.25-.3.37-.45.12-.15.17-.25.25-.42.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.84-.2-.49-.4-.42-.56-.43"
      />
    </svg>
  );
}

export function ContactWhatsAppButton({
  contact,
  size = "md",
  onSent,
}: {
  contact: ContactListItem;
  size?: "md" | "lg";
  onSent: (contactId: string, sentAt: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const hasPhone = Boolean(contact.phone && contact.phone !== "—");
  const sent = Boolean(contact.whatsappSentAt);

  if (!hasPhone) return null;

  const dim = size === "lg" ? "size-11" : "size-9";

  async function openChat() {
    if (pending) return;
    setPending(true);
    try {
      const { url } = await openContactWhatsApp(contact.id);
      openWhatsAppClickUrl(url);
      if (!sent) setConfirming(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open WhatsApp");
    } finally {
      setPending(false);
    }
  }

  async function markSent() {
    if (pending) return;
    setPending(true);
    try {
      const { sentAt } = await markContactWhatsAppSent(contact.id);
      onSent(contact.id, sentAt);
      setConfirming(false);
      toast.success("WhatsApp marked as sent");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not mark WhatsApp as sent");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void openChat()}
        disabled={pending}
        aria-label={sent ? `Open WhatsApp again for ${contact.name}` : `WhatsApp ${contact.name}`}
        title={sent ? "Sent. Open chat again" : "Open WhatsApp with a tasting message"}
        className={cn(
          "flex items-center justify-center rounded-full text-white active:scale-95 disabled:opacity-60",
          dim,
          sent ? "bg-[#128C7E]" : "bg-[#25D366]",
        )}
      >
        {sent ? <Check className="size-5" strokeWidth={3} /> : <WhatsAppGlyph className="size-6" />}
      </button>
      {sent ? (
        <span className="text-[9px] font-bold uppercase tracking-wide text-[#128C7E]">Sent</span>
      ) : confirming ? (
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => void markSent()}
            className="rounded-md bg-[#25D366] px-1.5 py-0.5 text-[9px] font-bold text-white"
          >
            Yes, sent
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-md bg-brand-canvas px-1.5 py-0.5 text-[9px] font-semibold text-brand-ink-soft"
          >
            Not yet
          </button>
        </div>
      ) : null}
    </div>
  );
}
