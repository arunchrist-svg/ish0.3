import { Resend } from "resend";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { extractEmailAddresses } from "@/lib/email/email-address";
import { isBounceLikeLastEvent } from "@/lib/email/resend-webhook";
import { applyScheduleBounce, findScheduleForBounce } from "@/lib/email/process-bounce";

const lastSyncAt = new Map<string, number>();
const SYNC_COOLDOWN_MS = 30_000;

function bounceMetaFromLastEvent(lastEvent: string): { bounceType: string; bounceReason: string } {
  if (lastEvent === "complained") {
    return { bounceType: "Complaint", bounceReason: "Recipient marked the email as spam" };
  }
  if (lastEvent === "failed" || lastEvent === "suppressed") {
    return { bounceType: "Failed", bounceReason: `Resend last event: ${lastEvent}` };
  }
  return { bounceType: "Permanent", bounceReason: "Mailbox rejected the email" };
}

export async function syncResendBounces(workspaceId: string): Promise<{ updated: number; skipped: boolean }> {
  const previous = lastSyncAt.get(workspaceId) ?? 0;
  if (Date.now() - previous < SYNC_COOLDOWN_MS) {
    return { updated: 0, skipped: true };
  }
  lastSyncAt.set(workspaceId, Date.now());

  const config = await getResolvedEmailConfig(workspaceId);
  const apiKey = config.resendApiKey?.trim() || process.env.RESEND_API_KEY?.trim();
  if (!apiKey || config.provider !== "resend") {
    return { updated: 0, skipped: true };
  }

  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.list({ limit: 100 });
  if (error || !data?.data) {
    if (error) console.error("[resend-bounce-sync] list failed", error);
    return { updated: 0, skipped: true };
  }

  let updated = 0;
  for (const email of data.data) {
    if (!isBounceLikeLastEvent(email.last_event)) continue;
    const recipient = extractEmailAddresses(email.to)[0];
    const row = await findScheduleForBounce({
      emailId: email.id,
      recipient,
      subject: email.subject,
      createdAt: email.created_at,
    });
    if (!row || row.bouncedAt) continue;

    const meta = bounceMetaFromLastEvent(email.last_event);
    await applyScheduleBounce({
      row,
      bouncedAt: email.created_at ? new Date(email.created_at) : new Date(),
      bounceType: meta.bounceType,
      bounceReason: meta.bounceReason,
      recipient,
      emailId: email.id,
      eventType: `email.${email.last_event}`,
    });
    updated += 1;
  }

  return { updated, skipped: false };
}
