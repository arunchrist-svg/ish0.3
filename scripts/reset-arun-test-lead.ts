import { config } from "dotenv";
config({ path: ".env.local" });

import {
  db,
  leads,
  leadOutreach,
  outreachApprovals,
  outreachEditMessages,
  outreachSchedule,
  workspaceSettings,
} from "../src/db";
import { eq, inArray } from "drizzle-orm";
import { invalidateEmailConfigCache } from "../src/lib/email/email-sender";

const PROD_TEST_LEAD_ID = "00000000-0000-0000-0000-000000000117";
const PROD_WORKSPACE_ID = "cb86c446-0839-4ab8-9f47-ae295bfa5e36";

type ResetTarget = "contact_ready" | "outreached";

async function resetToContactReady() {
  const outreachRows = await db
    .select({ id: leadOutreach.id })
    .from(leadOutreach)
    .where(eq(leadOutreach.leadId, PROD_TEST_LEAD_ID));
  const outreachIds = outreachRows.map((r) => r.id);

  await db.delete(outreachSchedule).where(eq(outreachSchedule.leadId, PROD_TEST_LEAD_ID));
  await db.delete(outreachApprovals).where(eq(outreachApprovals.leadId, PROD_TEST_LEAD_ID));
  if (outreachIds.length > 0) {
    await db.delete(outreachEditMessages).where(inArray(outreachEditMessages.leadOutreachId, outreachIds));
  }
  await db.delete(leadOutreach).where(eq(leadOutreach.leadId, PROD_TEST_LEAD_ID));

  await db
    .update(leads)
    .set({ status: "researched", lastReplyContent: null, updatedAt: new Date() })
    .where(eq(leads.id, PROD_TEST_LEAD_ID));
}

async function resetToOutreached() {
  const cadenceDays = [3, 7];
  const now = Date.now();
  const firstSentAt = new Date("2026-06-25T06:13:21.357Z");

  await db
    .update(leads)
    .set({ status: "outreached", lastReplyContent: null, updatedAt: new Date() })
    .where(eq(leads.id, PROD_TEST_LEAD_ID));

  const scheduleRows = await db
    .select()
    .from(outreachSchedule)
    .where(eq(outreachSchedule.leadId, PROD_TEST_LEAD_ID));

  for (const row of scheduleRows) {
    if (row.sequenceDay === 0) {
      await db
        .update(outreachSchedule)
        .set({ status: "sent", sentAt: firstSentAt, openedAt: null })
        .where(eq(outreachSchedule.id, row.id));
      continue;
    }

    if (cadenceDays.includes(row.sequenceDay)) {
      await db
        .update(outreachSchedule)
        .set({
          status: "scheduled",
          sentAt: null,
          openedAt: null,
          scheduledFor: new Date(now + row.sequenceDay * 24 * 60 * 60 * 1000),
          trackingToken: crypto.randomUUID(),
        })
        .where(eq(outreachSchedule.id, row.id));
    }
  }
}

async function clearReplyPollState() {
  const [settings] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, PROD_WORKSPACE_ID))
    .limit(1);

  if (!settings?.emailConfig) return;

  const emailConfig = {
    ...(settings.emailConfig as object),
    processedReplyMessageIds: [],
    lastReplyPollAt: undefined,
  };
  await db
    .update(workspaceSettings)
    .set({ emailConfig, updatedAt: new Date() })
    .where(eq(workspaceSettings.workspaceId, PROD_WORKSPACE_ID));
  invalidateEmailConfigCache();
}

async function main() {
  const target = (process.argv[2] as ResetTarget | undefined) ?? "contact_ready";

  if (target === "contact_ready") {
    await resetToContactReady();
  } else if (target === "outreached") {
    await resetToOutreached();
  } else {
    throw new Error(`Unknown target: ${target}. Use contact_ready or outreached.`);
  }

  await clearReplyPollState();

  const updated = await db.query.leads.findFirst({ where: eq(leads.id, PROD_TEST_LEAD_ID) });
  const sched = await db
    .select({ day: outreachSchedule.sequenceDay, status: outreachSchedule.status })
    .from(outreachSchedule)
    .where(eq(outreachSchedule.leadId, PROD_TEST_LEAD_ID));
  const outreach = await db
    .select({ id: leadOutreach.id })
    .from(leadOutreach)
    .where(eq(leadOutreach.leadId, PROD_TEST_LEAD_ID));

  console.log("Reset complete for Arun test lead:", PROD_TEST_LEAD_ID);
  console.log("Target:", target);
  console.log("Status:", updated?.status, "(Contact Ready)");
  console.log("Outreach drafts:", outreach.length);
  console.log("Schedule rows:", sched.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
