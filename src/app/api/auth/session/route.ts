import { NextResponse } from "next/server";
import { db, tenants, users } from "@/db";
import { eq } from "drizzle-orm";
import { isSuperadmin } from "@/lib/auth/platform";
import { getSessionRecord, getSessionTokenFromCookies } from "@/lib/auth/session";

export async function GET() {
  const token = await getSessionTokenFromCookies();
  const record = await getSessionRecord(token);
  if (!record) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const [user] = await db
    .select({ platformRole: users.platformRole, mustChangePassword: users.mustChangePassword })
    .from(users)
    .where(eq(users.id, record.id))
    .limit(1);

  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  if (isSuperadmin(user.platformRole)) {
    return NextResponse.json({
      authenticated: true,
      redirect: user.mustChangePassword ? "/change-password" : "/admin",
    });
  }

  if (!record.tenantId) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const [tenant] = await db
    .select({ onboardingStatus: tenants.onboardingStatus })
    .from(tenants)
    .where(eq(tenants.id, record.tenantId))
    .limit(1);

  let redirect = "/";
  if (user.mustChangePassword) {
    redirect = "/change-password";
  } else if (tenant?.onboardingStatus !== "complete") {
    redirect = "/onboarding";
  }

  return NextResponse.json({ authenticated: true, redirect });
}
