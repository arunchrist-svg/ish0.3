import { NextResponse } from "next/server";
import { db, orgMembers, users } from "@/db";
import { and, eq } from "drizzle-orm";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { canManageTeam } from "@/lib/auth/platform";
import { generateTempPassword } from "@/lib/auth/org-members";
import { hashPassword } from "@/lib/auth/password";
import { handleApiError } from "@/lib/api-errors";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(_req: Request, { params }: Params) {
  try {
    const ctx = await requireTenantContext();
    if (!canManageTeam(ctx.role, ctx.platformRole)) {
      throw new ForbiddenError("Only admins can reset passwords");
    }

    const { id: userId } = await params;

    const [member] = await db
      .select({ id: orgMembers.id })
      .from(orgMembers)
      .where(and(eq(orgMembers.userId, userId), eq(orgMembers.tenantId, ctx.tenantId)))
      .limit(1);

    if (!member) {
      return NextResponse.json({ error: "User not found in organization" }, { status: 404 });
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await hashPassword(tempPassword);

    await db
      .update(users)
      .set({ passwordHash, mustChangePassword: true })
      .where(eq(users.id, userId));

    return NextResponse.json({ ok: true, tempPassword });
  } catch (e) {
    return handleApiError(e, "[team/users/reset-password]");
  }
}
