import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { handleApiError } from "@/lib/api-errors";
import {
  WhatsAppEmptyDraftError,
  WhatsAppMobileRequiredError,
  WhatsAppNotConnectedError,
} from "@/lib/whatsapp/errors";
import { recordWhatsAppOpen } from "@/lib/whatsapp/record-open";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const { leadOutreachId } = await req.json();
    if (!leadOutreachId) {
      return NextResponse.json({ error: "leadOutreachId required" }, { status: 400 });
    }

    const result = await recordWhatsAppOpen({
      leadOutreachId,
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
    });

    return NextResponse.json(result);
  } catch (e) {
    if (
      e instanceof WhatsAppNotConnectedError ||
      e instanceof WhatsAppMobileRequiredError ||
      e instanceof WhatsAppEmptyDraftError
    ) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 400 });
    }
    if (e instanceof Error && e.message === "WhatsApp draft not found") {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    if (e instanceof Error && e.message === "Lead not found") {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    return handleApiError(e, "[api/outreach/whatsapp/open]");
  }
}
