import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api-errors";
import { WhatsAppMobileRequiredError } from "@/lib/whatsapp/errors";
import { markContactWhatsAppSent, openContactWhatsApp } from "@/lib/whatsapp/contact-open";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const action = body.action === "sent" ? "sent" : "open";

    if (action === "sent") {
      const result = await markContactWhatsAppSent({
        contactId: id,
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
        actorId: ctx.userId,
      });
      return NextResponse.json(result);
    }

    const result = await openContactWhatsApp({
      contactId: id,
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof WhatsAppMobileRequiredError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    if (e instanceof Error && e.message === "Contact not found") {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    return handleApiError(e, "[api/contacts/whatsapp]");
  }
}
