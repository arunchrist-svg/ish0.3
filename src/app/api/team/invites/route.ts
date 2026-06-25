import { NextResponse } from "next/server";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { canManageTeam } from "@/lib/auth/platform";
import { listPendingInvites } from "@/lib/auth/invites";
import { handleApiError } from "@/lib/api-errors";

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    if (!canManageTeam(ctx.role, ctx.platformRole)) {
      throw new ForbiddenError("Only admins can view invites");
    }
    const invites = await listPendingInvites(ctx.tenantId);
    return NextResponse.json({ invites });
  } catch (e) {
    return handleApiError(e, "[team/invites]");
  }
}
