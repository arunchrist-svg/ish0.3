import webpush from "web-push";
import { db, pushSubscriptions } from "@/db";
import { eq, and } from "drizzle-orm";
import { ensureVapidConfigured } from "@/lib/push/vapid";

export async function sendPushToUser(
  userId: string,
  tenantId: string,
  payload: { title: string; body: string; url?: string },
): Promise<number> {
  if (!ensureVapidConfigured()) return 0;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.tenantId, tenantId)));

  let sent = 0;
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
      );
      sent += 1;
    } catch {
      /* stale subscription — ignore */
    }
  }
  return sent;
}
