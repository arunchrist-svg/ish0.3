import { and, desc, eq } from "drizzle-orm";
import { db, leadOutreach, leads, outreachSchedule } from "@/db";
import { runWhatsAppWriter } from "@/lib/agents/writer-whatsapp";
import { assertCredits, deductCredits } from "@/lib/billing/credits";
import { getAgentFlags } from "@/lib/settings/agent-flags";
import { sanitizePhone } from "@/lib/enrichment/validate-contact";
import { WHATSAPP_CHANNEL, WHATSAPP_TEMPLATE_VARIANT } from "@/lib/whatsapp/outreach";
import { recordWhatsAppOpen } from "@/lib/whatsapp/record-open";
import type { WhatsAppAutoOpenPayload } from "@/lib/whatsapp/auto-after-second-email";

function hasFirstEmailSent(
  rows: Array<{
    channel: string | null;
    status: string;
    sequenceDay: number;
  }>,
): boolean {
  return rows.some(
    (row) => row.channel === "email" && row.status === "sent" && row.sequenceDay === 0,
  );
}

/**
 * When whatsAppFirst is enabled, fire WhatsApp immediately after email 1
 * instead of waiting for the second email. Designed for festive season
 * where procurement moves on WhatsApp and timing is critical.
 */
export async function maybeAutoOpenWhatsAppAfterFirstEmail(params: {
  leadId: string;
  tenantId: string;
  workspaceId: string;
  actorId?: string;
}): Promise<WhatsAppAutoOpenPayload | null> {
  const flags = await getAgentFlags(params.workspaceId);
  if (!flags.whatsAppFirst) return null;

  const rows = await db.query.outreachSchedule.findMany({
    where: eq(outreachSchedule.leadId, params.leadId),
  });

  if (!hasFirstEmailSent(rows)) return null;
  if (rows.some((row) => row.channel === WHATSAPP_CHANNEL && row.status === "sent")) return null;
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, params.leadId),
    with: { contact: true },
  });
  if (!lead || lead.tenantId !== params.tenantId) return null;
  if (!sanitizePhone(lead.contact?.phone)) return null;

  let outreach = await db.query.leadOutreach.findFirst({
    where: and(
      eq(leadOutreach.leadId, params.leadId),
      eq(leadOutreach.templateVariant, WHATSAPP_TEMPLATE_VARIANT),
    ),
    orderBy: [desc(leadOutreach.createdAt)],
  });

  if (!outreach?.whatsapp?.trim()) {
    try {
      await assertCredits(params.tenantId, "writer.draft", 1);
      const outreachId = await runWhatsAppWriter(params.leadId);
      await deductCredits({
        tenantId: params.tenantId,
        action: "writer.draft",
        referenceId: outreachId,
      });
      outreach = await db.query.leadOutreach.findFirst({ where: eq(leadOutreach.id, outreachId) });
    } catch (e) {
      console.warn("[whatsapp/auto-after-first-email] draft generation skipped", e);
      return null;
    }
  }

  if (!outreach?.id) return null;

  try {
    return await recordWhatsAppOpen({
      leadOutreachId: outreach.id,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      actorId: params.actorId,
    });
  } catch (e) {
    console.warn("[whatsapp/auto-after-first-email] open skipped", e);
    return null;
  }
}
