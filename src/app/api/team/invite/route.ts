import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { canManageTeam } from "@/lib/auth/platform";
import { createOrgInvite } from "@/lib/auth/invites";
import { handleApiError } from "@/lib/api-errors";
import type { TenantRole } from "@/lib/tenant";
import { db, users, tenants, orgMembers } from "@/db";
import { getShareableAppUrl } from "@/lib/app-url";
import { sendSystemEmail } from "@/lib/email/system-email";
import { buildTeamInviteEmail } from "@/lib/email/invite-email";
import { isSmtpServerId } from "@/lib/email/inbox-setup-guide";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import type { SmtpServerId } from "@/lib/email/config";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    if (!canManageTeam(ctx.role, ctx.platformRole)) {
      throw new ForbiddenError("Only admins can invite team members");
    }

    const body = (await req.json()) as {
      email?: string;
      role?: TenantRole;
      mailHost?: SmtpServerId;
      sendEmail?: boolean;
    };
    if (!body.email?.trim()) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }
    if (body.mailHost && !isSmtpServerId(body.mailHost)) {
      return NextResponse.json({ error: "Choose Gmail, Zoho India, or Zoho" }, { status: 400 });
    }

    const email = body.email.trim().toLowerCase();
    const role = (body.role ?? "member") as TenantRole;
    const mailHost = body.mailHost;
    const sendEmail = body.sendEmail !== false;

    const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    const alreadyMember = existingUser
      ? Boolean(
          (
            await db
              .select({ id: orgMembers.id })
              .from(orgMembers)
              .where(and(eq(orgMembers.userId, existingUser.id), eq(orgMembers.tenantId, ctx.tenantId)))
              .limit(1)
          )[0],
        )
      : false;
    const [tenant] = await db
      .select({ name: tenants.name })
      .from(tenants)
      .where(eq(tenants.id, ctx.tenantId))
      .limit(1);

    const invite = alreadyMember
      ? null
      : await createOrgInvite({
          tenantId: ctx.tenantId,
          email,
          role,
          invitedBy: ctx.userId,
        });

    const appUrl = getShareableAppUrl();
    const settingsNext = `/settings?tab=email${mailHost ? `&mail=${mailHost}` : ""}`;
    const joinUrl = existingUser
      ? `${appUrl}/login?next=${encodeURIComponent(settingsNext)}`
      : mailHost && invite
        ? `${invite.inviteUrl}&mail=${mailHost}`
        : invite?.inviteUrl ?? `${appUrl}/login?next=${encodeURIComponent(settingsNext)}`;

    let emailed = false;
    let emailError: string | undefined;
    let emailDryRun = false;

    if (sendEmail) {
      const message = buildTeamInviteEmail({
        tenantName: tenant?.name ?? "your workspace",
        inviteUrl: joinUrl,
        role,
        mailHost,
        existingUser: Boolean(existingUser),
      });
      const sent = await sendSystemEmail({
        to: email,
        subject: message.subject,
        html: message.html,
        smtpFallback: await getResolvedEmailConfig(ctx.workspaceId),
      });
      emailed = sent.ok;
      emailError = sent.error;
      emailDryRun = sent.dryRun === true;
    }

    return NextResponse.json({
      ok: true,
      inviteUrl: joinUrl,
      expiresAt: invite?.expiresAt ?? null,
      emailed,
      emailDryRun,
      emailError,
      existingUser: Boolean(existingUser),
    });
  } catch (e) {
    return handleApiError(e, "[team/invite]");
  }
}
