import { NextResponse } from "next/server";
import { db, orgMembers, teamMembers, users } from "@/db";
import { and, eq } from "drizzle-orm";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { canManageTeam, canChangeMemberRole } from "@/lib/auth/platform";
import { assertNotLastOwner } from "@/lib/auth/org-members";
import { parseTeamLinkedIn } from "@/lib/linkedin/profile-url";
import { handleApiError } from "@/lib/api-errors";
import type { TenantRole } from "@/lib/tenant";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  try {
    const ctx = await requireTenantContext();
    if (!canManageTeam(ctx.role, ctx.platformRole)) {
      throw new ForbiddenError("Only admins can update members");
    }

    const { id: memberId } = await params;
    const body = (await req.json()) as { role?: TenantRole; status?: "active" | "disabled"; linkedIn?: string | null };

    const [member] = await db
      .select({ id: orgMembers.id, role: orgMembers.role, userId: orgMembers.userId })
      .from(orgMembers)
      .where(and(eq(orgMembers.id, memberId), eq(orgMembers.tenantId, ctx.tenantId)))
      .limit(1);

    if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    if (member.userId === ctx.userId && body.status === "disabled") {
      return NextResponse.json({ error: "You cannot disable your own account" }, { status: 400 });
    }

    if (body.role && !canChangeMemberRole(ctx.role, body.role)) {
      throw new ForbiddenError("You cannot assign this role");
    }

    await assertNotLastOwner(ctx.tenantId, memberId, body.role, body.status);

    const updates: Partial<{ role: string; status: string }> = {};
    if (body.role) updates.role = body.role;
    if (body.status) updates.status = body.status;

    let linkedIn: string | null | undefined;
    if (body.linkedIn !== undefined) {
      try {
        linkedIn = parseTeamLinkedIn(body.linkedIn);
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid LinkedIn URL" }, { status: 400 });
      }
    }

    if (Object.keys(updates).length === 0 && linkedIn === undefined) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    if (Object.keys(updates).length > 0) {
      await db.update(orgMembers).set(updates).where(eq(orgMembers.id, memberId));
    }

    if (linkedIn !== undefined) {
      await db.update(users).set({ linkedIn }).where(eq(users.id, member.userId));
      await db
        .update(teamMembers)
        .set({ linkedInUrl: linkedIn, updatedAt: new Date() })
        .where(eq(teamMembers.userId, member.userId));
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e, "[team/members PATCH]");
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const ctx = await requireTenantContext();
    if (!canManageTeam(ctx.role, ctx.platformRole)) {
      throw new ForbiddenError("Only admins can remove members");
    }

    const { id: memberId } = await params;

    const [member] = await db
      .select({ id: orgMembers.id, userId: orgMembers.userId })
      .from(orgMembers)
      .where(and(eq(orgMembers.id, memberId), eq(orgMembers.tenantId, ctx.tenantId)))
      .limit(1);

    if (!member) return NextResponse.json({ error: "Member not found" }, { status: 404 });
    if (member.userId === ctx.userId) {
      return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 });
    }

    await assertNotLastOwner(ctx.tenantId, memberId);

    await db.delete(orgMembers).where(eq(orgMembers.id, memberId));

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e, "[team/members DELETE]");
  }
}
