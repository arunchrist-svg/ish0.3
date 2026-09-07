import { getSocket } from "./session";

// Stay in the 5–15 second range — looks human, avoids ban triggers.
const MIN_DELAY_MS = 5_000;
const MAX_DELAY_MS = 15_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(): Promise<void> {
  return delay(MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}

// Baileys JID for a personal WhatsApp number.
// phone: digits only with country code, e.g. "919876543210"
function toJID(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `${digits}@s.whatsapp.net`;
}

export type SendResult =
  | { success: true }
  | { success: false; error: string };

export async function sendWhatsAppMessage(
  phone: string,
  text: string,
): Promise<SendResult> {
  const socket = getSocket();
  if (!socket) {
    return { success: false, error: "WhatsApp session not connected" };
  }

  try {
    await socket.sendMessage(toJID(phone), { text });
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Send failed",
    };
  }
}

export type BatchItem = {
  id: string;        // outreachSchedule.id
  phone: string;     // E.164 digits, e.g. "919876543210"
  text: string;      // the WhatsApp message body
};

export async function sendBatch(
  items: BatchItem[],
  onResult: (id: string, result: SendResult) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const result = await sendWhatsAppMessage(item.phone, item.text);
    await onResult(item.id, result);
    console.log(`[baileys] ${result.success ? "✓" : "✗"} ${item.phone} — ${result.success ? "sent" : (result as { success: false; error: string }).error}`);

    // Skip the delay after the last message.
    if (i < items.length - 1) {
      await randomDelay();
    }
  }
}
