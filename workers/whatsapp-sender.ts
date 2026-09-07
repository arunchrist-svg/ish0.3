/**
 * Baileys WhatsApp sender worker.
 *
 * Run with:
 *   npx tsx workers/whatsapp-sender.ts
 *
 * Prerequisites:
 *   npm install @whiskeysockets/baileys @hapi/boom pino
 *
 * On first run, scan the QR code printed in the terminal.
 * Auth is persisted to .whatsapp-auth/ so subsequent runs skip the QR.
 *
 * Polls outreach_schedule WHERE channel='whatsapp' AND status='pending_wa'.
 * For each row: fetches the WhatsApp text from lead_outreach, sends via Baileys,
 * then marks the row status='sent' with sentAt=now().
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { and, eq, isNotNull } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { startSession, getSessionStatus } from "../src/lib/whatsapp/baileys/session";
import { sendBatch, type BatchItem } from "../src/lib/whatsapp/baileys/sender";

const POLL_INTERVAL_MS = 10_000;

function buildDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  return drizzle(pool, { schema });
}

const db = buildDb();

async function fetchPending(): Promise<BatchItem[]> {
  const rows = await db
    .select({
      id: schema.outreachSchedule.id,
      recipientPhone: schema.outreachSchedule.recipientPhone,
      whatsappText: schema.leadOutreach.whatsapp,
    })
    .from(schema.outreachSchedule)
    .leftJoin(
      schema.leadOutreach,
      eq(schema.outreachSchedule.draftLeadOutreachId, schema.leadOutreach.id),
    )
    .where(
      and(
        eq(schema.outreachSchedule.channel, "whatsapp"),
        eq(schema.outreachSchedule.status, "pending_wa"),
        isNotNull(schema.outreachSchedule.recipientPhone),
        isNotNull(schema.leadOutreach.whatsapp),
      ),
    )
    .limit(50);

  return rows
    .filter((r): r is typeof r & { recipientPhone: string; whatsappText: string } =>
      r.recipientPhone !== null && r.whatsappText !== null,
    )
    .map((r) => ({
      id: r.id,
      phone: r.recipientPhone.replace(/\D/g, ""),
      text: r.whatsappText,
    }));
}

async function markSent(id: string) {
  await db
    .update(schema.outreachSchedule)
    .set({ status: "sent", sentAt: new Date() })
    .where(eq(schema.outreachSchedule.id, id));
}

async function markFailed(id: string, error: string) {
  await db
    .update(schema.outreachSchedule)
    .set({ status: "failed", bodySnippet: `send error: ${error}` })
    .where(eq(schema.outreachSchedule.id, id));
}

async function poll() {
  const status = getSessionStatus();
  if (status !== "connected") {
    console.log(`[worker] WhatsApp status: ${status} — skipping poll`);
    return;
  }

  const items = await fetchPending();
  if (items.length === 0) return;

  console.log(`[worker] Found ${items.length} pending message(s)`);

  await sendBatch(items, async (id, result) => {
    if (result.success) {
      await markSent(id);
    } else {
      await markFailed(id, result.error);
    }
  });
}

async function main() {
  console.log("[worker] Starting Baileys session…");
  await startSession();

  // Wait up to 60s for the session to be connected or QR-ready before entering the loop.
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const s = getSessionStatus();
    if (s === "connected" || s === "qr") break;
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("[worker] Entering poll loop (every 10s)");
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await poll();
    } catch (err) {
      console.error("[worker] Poll error:", err);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error("[worker] Fatal:", err);
  process.exit(1);
});
