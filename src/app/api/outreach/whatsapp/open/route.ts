import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, outreachApprovals, leadOutreach, leads, contacts, outreachSchedule, yieldFunnel } from "@/db";
import { requireTenantContext } from "@/lib/tenant";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api-errors";
import { logAudit } from "@/lib/audit";
import { isWhatsAppConnected } from "@/lib/settings/whatsapp-settings";
import { sanitizePhone } from "@/lib/enrichment/validate-contact";
import { buildWhatsAppClickUrl, toWhatsAppE164 } from "@/lib/whatsapp/click-url";
import { isWhatsAppOutreach, WHATSAPP_CHANNEL } from "@/lib/whatsapp/outreach";
import {
  WhatsAppEmptyDraftError,
  WhatsAppMobileRequiredError,
  WhatsAppNotConnectedError,
  shouldAdvanceLeadFromWhatsApp,
} from "@/lib/whatsapp/errors";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const { leadOutreachId } = await req.json();
    if (!leadOutreachId) {
      return NextResponse.json({ error: "leadOutreachId required" }, { status: 400 });
    }

    const outreach = await db.query.leadOutreach.findFirst({
      where: eq(leadOutreach.id, leadOutreachId),
    });
    if (!outreach || !isWhatsAppOutreach(outreach)) {
      return NextResponse.json({ error: "WhatsApp draft not found" }, { status: 404 });
    }

    const lead = await db.query.leads.findFirst({
      where: eq(leads.id, outreach.leadId),
      with: { contact: true },
    });
    if (!lead || lead.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (!(await isWhatsAppConnected(ctx.workspaceId))) {
      throw new WhatsAppNotConnectedError();
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
        actorId: ctx.userId,
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
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      action: "outreach.whatsapp_opened",
      entityType: "lead",
      entityId: lead.id,
      metadata: { leadOutreachId: outreach.id, approvalId: approval.id, to: e164 },
    });

    return NextResponse.json({ url, to: e164 });
  } catch (e) {
    if (
      e instanceof WhatsAppNotConnectedError ||
      e instanceof WhatsAppMobileRequiredError ||
      e instanceof WhatsAppEmptyDraftError
    ) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    return handleApiError(e, "[api/outreach/whatsapp/open]");
  }
}
