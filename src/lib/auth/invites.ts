import { randomBytes } from "crypto";
import { db, orgInvites, orgMembers, tenants, users, workspaces } from "@/db";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { TenantRole } from "@/lib/tenant";

const INVITE_DAYS = 7;

export function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createOrgInvite(params: {
  tenantId: string;
  email: string;
  role: TenantRole;
  invitedBy: string;
}): Promise<{ id: string; token: string; expiresAt: Date }> {
  const normalizedEmail = params.email.trim().toLowerCase();
  const token = generateInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);

  const [invite] = await db
    .insert(orgInvites)
    .values({
      tenantId: params.tenantId,
      email: normalizedEmail,
      role: params.role,
      token,
      invitedBy: params.invitedBy,
      expiresAt,
    })
    .returning();

  return { id: invite.id, token: invite.token, expiresAt: invite.expiresAt };
}

export async function getInviteByToken(token: string) {
  const [invite] = await db
    .select({
      id: orgInvites.id,
      email: orgInvites.email,
      role: orgInvites.role,
      tenantId: orgInvites.tenantId,
      expiresAt: orgInvites.expiresAt,
      acceptedAt: orgInvites.acceptedAt,
      tenantName: tenants.name,
    })
    .from(orgInvites)
    .innerJoin(tenants, eq(tenants.id, orgInvites.tenantId))
    .where(and(eq(orgInvites.token, token), isNull(orgInvites.acceptedAt), gt(orgInvites.expiresAt, new Date())))
    .limit(1);

  return invite ?? null;
}


export async function findPendingInviteForEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const [invite] = await db
    .select({ token: orgInvites.token })
    .from(orgInvites)
    .where(
      and(
        eq(orgInvites.email, normalizedEmail),
        isNull(orgInvites.acceptedAt),
        gt(orgInvites.expiresAt, new Date()),
      ),
    )
    .orderBy(orgInvites.createdAt)
    .limit(1);

  return invite?.token ?? null;
}

export async function acceptInvite(params: {
  token: string;
  userId: string;
}): Promise<{ tenantId: string; workspaceId: string }> {
  const invite = await getInviteByToken(params.token);
  if (!invite) throw new Error("Invite invalid or expired");

  const [user] = await db.select().from(users).where(eq(users.id, params.userId)).limit(1);
  if (!user || user.email.toLowerCase() !== invite.email.toLowerCase()) {
    throw new Error("Invite email does not match your account");
  }

  const existing = await db.query.orgMembers.findFirst({
    where: and(eq(orgMembers.userId, params.userId), eq(orgMembers.tenantId, invite.tenantId)),
  });

  if (!existing) {
    await db.insert(orgMembers).values({
      userId: params.userId,
      tenantId: invite.tenantId,
      role: invite.role,
    });
  }

  await db
    .update(orgInvites)
    .set({ acceptedAt: new Date() })
    .where(eq(orgInvites.id, invite.id));

  await db
    .update(tenants)
    .set({ onboardingStatus: "complete", onboardingStep: 6 })
    .where(eq(tenants.id, invite.tenantId));

  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.tenantId, invite.tenantId))
    .limit(1);

  if (!workspace) throw new Error("Workspace not found");

  return { tenantId: invite.tenantId, workspaceId: workspace.id };
}

export async function listPendingInvites(tenantId: string) {
  return db
    .select({
      id: orgInvites.id,
      email: orgInvites.email,
      role: orgInvites.role,
      expiresAt: orgInvites.expiresAt,
      createdAt: orgInvites.createdAt,
    })
    .from(orgInvites)
    .where(and(eq(orgInvites.tenantId, tenantId), isNull(orgInvites.acceptedAt), gt(orgInvites.expiresAt, new Date())))
    .orderBy(orgInvites.createdAt);
}
