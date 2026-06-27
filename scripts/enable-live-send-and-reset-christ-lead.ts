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

const WORKSPACE_ID = "cb86c446-0839-4ab8-9f47-ae295bfa5e36";
const LEAD_ID = "00000000-0000-0000-0000-000000000120";

async function setLiveSendMode() {
  const [row] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, WORKSPACE_ID))
    .limit(1);
  if (!row?.emailConfig) throw new Error("workspace emailConfig missing");

  const emailConfig = {
    ...(row.emailConfig as object),
    sendMode: "live",
  };
  await db
    .update(workspaceSettings)
    .set({ emailConfig, updatedAt: new Date() })
    .where(eq(workspaceSettings.workspaceId, WORKSPACE_ID));
  invalidateEmailConfigCache();
}

async function resetLeadToContactReady() {
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

async function main() {
  await setLiveSendMode();
  await resetLeadToContactReady();

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, LEAD_ID),
    with: { contact: true },
  });
  const [ws] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, WORKSPACE_ID))
    .limit(1);
  const ec = ws?.emailConfig as { sendMode?: string } | undefined;

  console.log(
    JSON.stringify(
      {
        sendMode: ec?.sendMode,
        leadStatus: lead?.status,
        contactEmail: (lead?.contact as { email?: string })?.email,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
