import { db, tenants } from "@/db";
import { eq } from "drizzle-orm";
import { isSuperadmin } from "@/lib/auth/platform";
import { listActiveMemberships } from "@/lib/tenant";

/** Default hub landing route after sign-in (side nav "Home"). */
export const POST_AUTH_HOME = "/";

export type PostAuthDestination = {
  redirect: string;
  tenantId: string | null;
};

/**
 * Resolve where to send the user after authentication.
 * Single-org users (including superadmin with one membership) land on Home (/).
 */
export async function resolvePostAuthDestination(params: {
  userId: string;
  platformRole: string | null;
  mustChangePassword: boolean;
  tenantId?: string | null;
  role?: string;
}): Promise<PostAuthDestination> {
  if (params.mustChangePassword) {
    return { redirect: "/change-password", tenantId: params.tenantId ?? null };
  }

  let tenantId = params.tenantId ?? null;
  let role = params.role;

  if (!tenantId) {
    const memberships = await listActiveMemberships(params.userId);
    if (memberships.length === 1) {
      tenantId = memberships[0]!.tenantId;
      role = memberships[0]!.role;
    } else if (memberships.length === 0) {
      if (isSuperadmin(params.platformRole)) {
        return { redirect: "/admin", tenantId: null };
      }
      throw new Error("No organization membership");
    } else if (isSuperadmin(params.platformRole)) {
      return { redirect: "/admin", tenantId: null };
    } else {
      throw new Error("Multiple organizations require slug");
    }
  }

  const [tenant] = await db
    .select({ onboardingStatus: tenants.onboardingStatus })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (tenant?.onboardingStatus !== "complete" && role === "owner") {
    return { redirect: "/onboarding", tenantId };
  }

  return { redirect: POST_AUTH_HOME, tenantId };
}
