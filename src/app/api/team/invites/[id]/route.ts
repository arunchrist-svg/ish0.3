import { NextResponse } from "next/server";
import { db, orgInvites } from "@/db";
import { and, eq } from "drizzle-orm";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { canManageTeam } from "@/lib/auth/platform";
import { handleApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireTenantContext();
    if (!canManageTeam(ctx.role, ctx.platformRole)) {
      throw new ForbiddenError("Only admins can revoke invites");
    }

    const { id } = await params;

    const [invite] = await db
      .select({ id: orgInvites.id })
      .from(orgInvites)
      .where(and(eq(orgInvites.id, id), eq(orgInvites.tenantId, ctx.tenantId)))
      .limit(1);

    if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

    await db.delete(orgInvites).where(eq(orgInvites.id, id));

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e, "[team/invites DELETE]");
  }
}
