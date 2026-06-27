import { NextResponse } from "next/server";
import { db, orgMembers, users } from "@/db";
import { eq } from "drizzle-orm";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { canManageTeam } from "@/lib/auth/platform";
import { handleApiError } from "@/lib/api-errors";

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    if (!canManageTeam(ctx.role, ctx.platformRole)) {
      throw new ForbiddenError("Only admins can view team");
    }

    const members = await db
      .select({
        id: orgMembers.id,
        role: orgMembers.role,
        status: orgMembers.status,
        createdAt: orgMembers.createdAt,
        name: users.name,
        email: users.email,
      })
      .from(orgMembers)
      .innerJoin(users, eq(users.id, orgMembers.userId))
      .where(eq(orgMembers.tenantId, ctx.tenantId));

    return NextResponse.json({ members });
  } catch (e) {
    return handleApiError(e, "[team/members]");
  }
}
