import { config } from "dotenv";
config({ path: ".env.local" });

import {
  db,
  leads,
  contacts,
  leadOutreach,
  outreachApprovals,
  outreachEditMessages,
  outreachSchedule,
  workspaceSettings,
} from "../src/db";
import { eq, inArray } from "drizzle-orm";
import { invalidateEmailConfigCache } from "../src/lib/email/email-sender";

const LEAD_ID = "00000000-0000-0000-0000-000000000120";
const WORKSPACE_ID = "cb86c446-0839-4ab8-9f47-ae295bfa5e36";

async function resetToContactReady() {
  const outreachRows = await db
    .select({ id: leadOutreach.id })
    .from(leadOutreach)
    .where(eq(leadOutreach.leadId, LEAD_ID));
  const outreachIds = outreachRows.map((r) => r.id);

  await db.delete(outreachSchedule).where(eq(outreachSchedule.leadId, LEAD_ID));
  await db.delete(outreachApprovals).where(eq(outreachApprovals.leadId, LEAD_ID));
  if (outreachIds.length > 0) {
    await db.delete(outreachEditMessages).where(inArray(outreachEditMessages.leadOutreachId, outreachIds));
  }
  await db.delete(leadOutreach).where(eq(leadOutreach.leadId, LEAD_ID));

  await db
    .update(leads)
    .set({ status: "researched", lastReplyContent: null, updatedAt: new Date() })
    .where(eq(leads.id, LEAD_ID));
}

async function clearReplyPollState() {
  const [settings] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, WORKSPACE_ID))
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
    .where(eq(workspaceSettings.workspaceId, WORKSPACE_ID));
  invalidateEmailConfigCache();
}

async function main() {
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, LEAD_ID),
    with: { contact: true },
  });

  if (!lead) {
    throw new Error(`Lead not found: ${LEAD_ID}`);
  }

  console.log("Before reset:");
  console.log("  ID:", lead.id);
  console.log("  Name:", lead.contact?.name);
  console.log("  Email:", lead.contact?.email);
  console.log("  Status:", lead.status);

  await resetToContactReady();
  await clearReplyPollState();

  const updated = await db.query.leads.findFirst({
    where: eq(leads.id, LEAD_ID),
    with: { contact: true },
  });
  const sched = await db
    .select({ id: outreachSchedule.id })
    .from(outreachSchedule)
    .where(eq(outreachSchedule.leadId, LEAD_ID));
  const outreach = await db
    .select({ id: leadOutreach.id })
    .from(leadOutreach)
    .where(eq(leadOutreach.leadId, LEAD_ID));
  const approvals = await db
    .select({ id: outreachApprovals.id })
    .from(outreachApprovals)
    .where(eq(outreachApprovals.leadId, LEAD_ID));

  console.log("\nReset complete:");
  console.log("  ID:", updated?.id);
  console.log("  Name:", updated?.contact?.name);
  console.log("  Email:", updated?.contact?.email);
  console.log("  Status:", updated?.status, "(Contact Ready)");
  console.log("  Outreach drafts:", outreach.length);
  console.log("  Schedule rows:", sched.length);
  console.log("  Approval rows:", approvals.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
