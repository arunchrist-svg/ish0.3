import { NextResponse } from "next/server";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { canManageTeam } from "@/lib/auth/platform";
import { createOrgInvite } from "@/lib/auth/invites";
import { handleApiError } from "@/lib/api-errors";
import type { TenantRole } from "@/lib/tenant";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    if (!canManageTeam(ctx.role, ctx.platformRole)) {
      throw new ForbiddenError("Only admins can invite team members");
    }

    const { email, role = "member" } = (await req.json()) as { email?: string; role?: TenantRole };
    if (!email?.trim()) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const invite = await createOrgInvite({
      tenantId: ctx.tenantId,
      email: email.trim(),
      role: role as TenantRole,
      invitedBy: ctx.userId,
    });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002";
    const inviteUrl = `${appUrl}/signup?invite=${invite.token}`;

    return NextResponse.json({
      ok: true,
      inviteUrl,
      expiresAt: invite.expiresAt,
    });
  } catch (e) {
    return handleApiError(e, "[team/invite]");
  }
}
