import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { requirePipelineWrite } from "@/lib/auth/permissions";
import { listDuplicateGroups, mergeDuplicateLeads } from "@/lib/leads/merge-duplicates";

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const result = await listDuplicateGroups(ctx.tenantId);
    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, "[api/leads/duplicates GET]");
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const body = (await req.json().catch(() => ({}))) as {
      keepId?: string;
      dropIds?: string[];
    };

    const result = await mergeDuplicateLeads({
      tenantId: ctx.tenantId,
      workspaceId: ctx.workspaceId,
      actorId: ctx.userId,
      keepId: body.keepId,
      dropIds: body.dropIds,
    });

    return NextResponse.json(result);
  } catch (e) {
    return handleApiError(e, "[api/leads/duplicates POST]");
  }
}
