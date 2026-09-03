import { eq } from "drizzle-orm";
import {
  db,
  outreachApprovals,
  leadOutreach,
  leads,
  contacts,
  outreachSchedule,
  yieldFunnel,
} from "@/db";
import { logAudit } from "@/lib/audit";
import { sanitizePhone } from "@/lib/enrichment/validate-contact";
import { buildWhatsAppClickUrl, toWhatsAppE164 } from "@/lib/whatsapp/click-url";
import { isWhatsAppOutreach, WHATSAPP_CHANNEL } from "@/lib/whatsapp/outreach";
import {
  WhatsAppEmptyDraftError,
  WhatsAppMobileRequiredError,
  shouldAdvanceLeadFromWhatsApp,
} from "@/lib/whatsapp/errors";

export async function recordWhatsAppOpen(params: {
  leadOutreachId: string;
  tenantId: string;
  workspaceId: string;
  actorId?: string;
}): Promise<{ url: string; to: string }> {
  const outreach = await db.query.leadOutreach.findFirst({
    where: eq(leadOutreach.id, params.leadOutreachId),
  });
  if (!outreach || !isWhatsAppOutreach(outreach)) {
    throw new Error("WhatsApp draft not found");
  }

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, outreach.leadId),
    with: { contact: true },
  });
  if (!lead || lead.tenantId !== params.tenantId) {
    throw new Error("Lead not found");
  }

  const contact = lead.contact as typeof contacts.$inferSelect;
  const phone = sanitizePhone(contact.phone);
  if (!phone) throw new WhatsAppMobileRequiredError();

  const body = (outreach.whatsapp ?? "").trim();
  if (!body) throw new WhatsAppEmptyDraftError();

  const url = buildWhatsAppClickUrl(phone, body);
  const e164 = toWhatsAppE164(phone)!;

  const [approval] = await db
    .insert(outreachApprovals)
    .values({
      leadOutreachId: outreach.id,
      leadId: lead.id,
      channel: WHATSAPP_CHANNEL,
      status: "approved",
      bodyUsed: body,
      reviewedAt: new Date(),
      actorId: params.actorId ?? null,
    })
    .returning();

  await db.insert(outreachSchedule).values({
    leadId: lead.id,
    approvalId: approval.id,
    channel: WHATSAPP_CHANNEL,
    sequenceDay: 0,
    scheduledFor: new Date(),
    sentAt: new Date(),
    status: "sent",
    sendMode: "live",
    recipientPhone: e164,
    bodySnippet: body.slice(0, 500),
    draftLeadOutreachId: outreach.id,
    emailKind: "whatsapp",
  });

  if (shouldAdvanceLeadFromWhatsApp(lead.status)) {
    await db.update(leads).set({ status: "outreached" }).where(eq(leads.id, lead.id));
    await db.insert(yieldFunnel).values({
      leadId: lead.id,
      stage: "outreached",
      metadata: { channel: WHATSAPP_CHANNEL, approvalId: approval.id },
    });
  }

  await logAudit({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    actorId: params.actorId,
    action: "outreach.whatsapp_opened",
    entityType: "lead",
    entityId: lead.id,
    metadata: { leadOutreachId: outreach.id, approvalId: approval.id, to: e164 },
  });

  return { url, to: e164 };
}
