import { NextResponse } from "next/server";
import { db, orgMembers, users } from "@/db";
import { and, eq } from "drizzle-orm";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { canManageTeam } from "@/lib/auth/platform";
import { createOrgUser } from "@/lib/auth/org-members";
import { handleApiError } from "@/lib/api-errors";
import type { TenantRole } from "@/lib/tenant";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    if (!canManageTeam(ctx.role, ctx.platformRole)) {
      throw new ForbiddenError("Only admins can create users");
    }

    const { email, name, role = "member", password, linkedIn } = (await req.json()) as {
      email?: string;
      name?: string;
      role?: TenantRole;
      password?: string;
      linkedIn?: string | null;
    };

    if (!email?.trim() || !name?.trim()) {
      return NextResponse.json({ error: "Email and name are required" }, { status: 400 });
    }

    if (role === "owner") {
      return NextResponse.json({ error: "Cannot direct-create owner role" }, { status: 400 });
    }

    let result;
    try {
      result = await createOrgUser({
        tenantId: ctx.tenantId,
        email: email.trim(),
        name: name.trim(),
        role: role as TenantRole,
        password,
        linkedIn,
      });
    } catch (e) {
      if (e instanceof Error && e.message.includes("LinkedIn profile URL")) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }

    const [user] = await db.select({ id: users.id, email: users.email, name: users.name }).from(users).where(eq(users.id, result.userId)).limit(1);
    const [member] = await db
      .select({ id: orgMembers.id, role: orgMembers.role })
      .from(orgMembers)
      .where(and(eq(orgMembers.userId, result.userId), eq(orgMembers.tenantId, ctx.tenantId)))
      .limit(1);

    return NextResponse.json({
      ok: true,
      user: { ...user, role: member?.role },
      tempPassword: result.tempPassword,
    });
  } catch (e) {
    return handleApiError(e, "[team/users POST]");
  }
}
