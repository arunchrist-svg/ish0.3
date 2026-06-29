import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { controlLeadSequence, type SequenceAction } from "@/lib/outreach/sequence-control";

const ACTIONS: SequenceAction[] = ["start", "pause", "cancel"];

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = await req.json();
    const leadId = typeof body.leadId === "string" ? body.leadId : "";
    const action = body.action as SequenceAction;

    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });
    if (!ACTIONS.includes(action)) {
      return NextResponse.json({ error: "action must be start, pause, or cancel" }, { status: 400 });
    }

    const result = await controlLeadSequence({
      leadId,
      action,
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, state: result.state, updated: result.updated });
  } catch (e) {
    return handleApiError(e, "[api/outreach/sequence]");
  }
}
