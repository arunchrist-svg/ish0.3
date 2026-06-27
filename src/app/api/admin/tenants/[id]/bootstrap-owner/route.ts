import { NextResponse } from "next/server";
import { db, orgMembers, tenants } from "@/db";
import { and, eq } from "drizzle-orm";
import { requireSuperadmin } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { createOrgInvite } from "@/lib/auth/invites";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    const admin = await requireSuperadmin();
    const { id: tenantId } = await params;
    const body = (await req.json()) as { ownerEmail?: string };

    if (!body.ownerEmail?.trim()) {
      return NextResponse.json({ error: "Owner email required" }, { status: 400 });
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (!tenant) return NextResponse.json({ error: "Tenant not found" }, { status: 404 });

    const [existingOwner] = await db
      .select({ id: orgMembers.id })
      .from(orgMembers)
      .where(and(eq(orgMembers.tenantId, tenantId), eq(orgMembers.role, "owner"), eq(orgMembers.status, "active")))
      .limit(1);

    if (existingOwner) {
      return NextResponse.json({ error: "Tenant already has an active owner" }, { status: 409 });
    }

    const invite = await createOrgInvite({
      tenantId,
      email: body.ownerEmail.trim(),
      role: "owner",
      invitedBy: admin.userId,
      invitedBySuperadmin: true,
      skipSeatCheck: true,
    });

    return NextResponse.json({
      inviteUrl: invite.inviteUrl,
      expiresAt: invite.expiresAt,
    });
  } catch (e) {
    return handleApiError(e, "[admin/tenants/bootstrap-owner]");
  }
}
