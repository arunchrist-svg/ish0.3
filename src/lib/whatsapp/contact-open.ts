import { and, eq } from "drizzle-orm";
import { db, contacts } from "@/db";
import { logAudit } from "@/lib/audit";
import { sanitizePhone } from "@/lib/enrichment/validate-contact";
import { buildWhatsAppClickUrl, toWhatsAppE164 } from "@/lib/whatsapp/click-url";
import { buildContactWhatsAppMessage } from "@/lib/whatsapp/contact-click";
import { WhatsAppMobileRequiredError } from "@/lib/whatsapp/errors";

export async function openContactWhatsApp(params: {
  contactId: string;
  tenantId: string;
  workspaceId: string;
  actorId?: string;
}): Promise<{ url: string; to: string; message: string }> {
  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, params.contactId),
    with: { account: true },
  });
  if (!contact || contact.tenantId !== params.tenantId || contact.workspaceId !== params.workspaceId) {
    throw new Error("Contact not found");
  }

  const phone = sanitizePhone(contact.phone);
  if (!phone) throw new WhatsAppMobileRequiredError();

  const message = buildContactWhatsAppMessage({
    name: contact.name,
    firstName: contact.firstName,
    company: contact.account?.name,
  });
  const url = buildWhatsAppClickUrl(phone, message);
  const e164 = toWhatsAppE164(phone)!;

  await db
    .update(contacts)
    .set({ whatsappOpenedAt: new Date(), updatedAt: new Date() })
    .where(eq(contacts.id, contact.id));

  await logAudit({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    actorId: params.actorId,
    action: "contact.whatsapp_opened",
    entityType: "contact",
    entityId: contact.id,
    metadata: { to: e164 },
  });

  return { url, to: e164, message };
}

export async function markContactWhatsAppSent(params: {
  contactId: string;
  tenantId: string;
  workspaceId: string;
  actorId?: string;
}): Promise<{ sentAt: string }> {
  const contact = await db.query.contacts.findFirst({
    where: eq(contacts.id, params.contactId),
  });
  if (!contact || contact.tenantId !== params.tenantId || contact.workspaceId !== params.workspaceId) {
    throw new Error("Contact not found");
  }
  if (!sanitizePhone(contact.phone)) throw new WhatsAppMobileRequiredError();

  const sentAt = new Date();
  await db
    .update(contacts)
    .set({
      whatsappSentAt: sentAt,
      whatsappOpenedAt: contact.whatsappOpenedAt ?? sentAt,
      updatedAt: sentAt,
    })
    .where(and(eq(contacts.id, contact.id), eq(contacts.tenantId, params.tenantId)));

  await logAudit({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    actorId: params.actorId,
    action: "contact.whatsapp_sent",
    entityType: "contact",
    entityId: contact.id,
    metadata: { sentAt: sentAt.toISOString() },
  });

  return { sentAt: sentAt.toISOString() };
}
