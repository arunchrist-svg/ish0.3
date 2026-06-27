import { randomBytes } from "crypto";
import { db, orgMembers, users } from "@/db";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/password";
import { assertSeatAvailable } from "@/lib/auth/invites";
import { countActiveOwners } from "@/lib/auth/invites";
import type { TenantRole } from "@/lib/tenant";
import { ForbiddenError } from "@/lib/tenant";

export function generateTempPassword(): string {
  return randomBytes(9).toString("base64url").slice(0, 12);
}

export async function createOrgUser(params: {
  tenantId: string;
  email: string;
  name: string;
  role: TenantRole;
  password?: string;
}): Promise<{ userId: string; tempPassword?: string }> {
  await assertSeatAvailable(params.tenantId);

  const normalizedEmail = params.email.trim().toLowerCase();
  const tempPassword = params.password ?? generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);

  const [existingUser] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

  let userId: string;
  if (existingUser) {
    const [existingMember] = await db
      .select({ id: orgMembers.id })
      .from(orgMembers)
      .where(and(eq(orgMembers.userId, existingUser.id), eq(orgMembers.tenantId, params.tenantId)))
      .limit(1);
    if (existingMember) throw new ForbiddenError("User is already a member of this organization");
    userId = existingUser.id;
    if (!existingUser.passwordHash) {
      await db.update(users).set({ passwordHash, mustChangePassword: true }).where(eq(users.id, userId));
    }
  } else {
    const [user] = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        name: params.name.trim(),
        passwordHash,
        mustChangePassword: true,
      })
      .returning();
    userId = user.id;
  }

  await db.insert(orgMembers).values({
    userId,
    tenantId: params.tenantId,
    role: params.role,
    status: "active",
  });

  return { userId, tempPassword: params.password ? undefined : tempPassword };
}

export async function assertNotLastOwner(tenantId: string, memberId: string, nextRole?: string, nextStatus?: string): Promise<void> {
  const [member] = await db
    .select({ role: orgMembers.role, status: orgMembers.status })
    .from(orgMembers)
    .where(eq(orgMembers.id, memberId))
    .limit(1);

  if (!member || member.role !== "owner") return;

  const demoting = nextRole !== undefined && nextRole !== "owner";
  const disabling = nextStatus === "disabled";
  const removing = nextRole === undefined && nextStatus === undefined;

  if (demoting || disabling || removing) {
    const owners = await countActiveOwners(tenantId);
    if (owners <= 1) {
      throw new ForbiddenError("Cannot remove or demote the last owner");
    }
  }
}
