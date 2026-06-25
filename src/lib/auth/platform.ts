import { db, users } from "@/db";
import { eq } from "drizzle-orm";
import { getSessionTokenFromCookies, getSessionUser } from "@/lib/auth/session";
import type { TenantRole } from "@/lib/tenant";

export type PlatformRole = "user" | "superadmin";

export {
  canManageBilling,
  canManageTeam,
  canManageSettings,
  canWritePipeline,
  isReadOnly,
  canChangeMemberRole,
} from "@/lib/auth/permissions";

export async function getPlatformUser() {
  const token = await getSessionTokenFromCookies();
  const sessionUser = await getSessionUser(token);
  if (!sessionUser) return null;

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      platformRole: users.platformRole,
    })
    .from(users)
    .where(eq(users.id, sessionUser.id))
    .limit(1);

  return user ?? null;
}

export function isSuperadmin(platformRole: string | null | undefined): boolean {
  return platformRole === "superadmin";
}
