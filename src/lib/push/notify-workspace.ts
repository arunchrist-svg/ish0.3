import { db, orgMembers, leads, contacts } from "@/db";
import { eq, and } from "drizzle-orm";
import { sendPushToUser } from "@/lib/push/server";

export async function notifyTenantMembers(
  tenantId: string,
  payload: { title: string; body: string; url?: string },
): Promise<number> {
  const members = await db
    .select({ userId: orgMembers.userId })
    .from(orgMembers)
    .where(and(eq(orgMembers.tenantId, tenantId), eq(orgMembers.status, "active")));

  let sent = 0;
  for (const m of members) {
    sent += await sendPushToUser(m.userId, tenantId, payload);
  }
  return sent;
}

export async function notifyLeadEvent(
  leadId: string,
  kind: "research.complete" | "draft.ready" | "reply.received" | "followup.pending_review",
): Promise<void> {
  try {
    const lead = await db.query.leads.findFirst({
      where: eq(leads.id, leadId),
      with: { contact: true },
    });
    if (!lead) return;

    const name = (lead.contact as typeof contacts.$inferSelect | null)?.name ?? "Lead";
    const url = `/leads?lead=${leadId}${kind === "draft.ready" || kind === "followup.pending_review" ? "&tab=Email" : ""}`;

    const messages: Record<typeof kind, { title: string; body: string }> = {
      "research.complete": {
        title: "Research ready",
        body: `Writer plan is ready for ${name}`,
      },
      "draft.ready": {
        title: "Draft needs review",
        body: `Email draft ready for ${name}`,
      },
      "reply.received": {
        title: "New reply",
        body: `${name} replied to your outreach`,
      },
      "followup.pending_review": {
        title: "Follow-up needs review",
        body: `Follow-up draft waiting for ${name}`,
      },
    };

    const msg = messages[kind];
    await notifyTenantMembers(lead.tenantId, { ...msg, url });
  } catch (e) {
    console.error("[push] notifyLeadEvent failed", kind, leadId, e);
  }
}
