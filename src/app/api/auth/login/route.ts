import { NextResponse } from "next/server";
import { db, tenants, users } from "@/db";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { isSuperadmin } from "@/lib/auth/platform";
import { listActiveMemberships } from "@/lib/tenant";
import { normalizeTenantSlug } from "@/lib/auth/slug";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, slug } = body as { email?: string; password?: string; slug?: string };

    if (!email?.trim() || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    if (!user.passwordHash) {
      return NextResponse.json({ error: "This account uses Google Sign-In" }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    if (isSuperadmin(user.platformRole)) {
      const token = await createSession(user.id, null);
      const redirect = user.mustChangePassword ? "/change-password" : "/admin";
      const res = NextResponse.json({ ok: true, redirect });
      res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(token));
      return res;
    }

    const memberships = await listActiveMemberships(user.id);
    if (memberships.length === 0) {
      return NextResponse.json({ error: "No organization membership found" }, { status: 401 });
    }

    let tenantId: string;
    let role = memberships[0]!.role;
    if (memberships.length === 1) {
      tenantId = memberships[0]!.tenantId;
      role = memberships[0]!.role;
    } else {
      if (!slug?.trim()) {
        return NextResponse.json(
          {
            error: "Multiple organizations match this email. Provide your organization slug.",
            code: "WORKSPACE_AMBIGUOUS",
            slugs: memberships.map((m) => ({ slug: m.slug, name: m.name })),
          },
          { status: 400 },
        );
      }
      const normalizedSlug = normalizeTenantSlug(slug);
      const match = memberships.find((m) => m.slug === normalizedSlug);
      if (!match) {
        return NextResponse.json({ error: "Organization slug not found for this account" }, { status: 401 });
      }
      tenantId = match.tenantId;
      role = match.role;
    }

    const [tenant] = await db
      .select({ onboardingStatus: tenants.onboardingStatus })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    let redirect = "/";
    if (user.mustChangePassword) {
      redirect = "/change-password";
    } else if (tenant?.onboardingStatus !== "complete" && role === "owner") {
      redirect = "/onboarding";
    }

    const token = await createSession(user.id, tenantId);
    const res = NextResponse.json({ ok: true, redirect });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(token));
    return res;
  } catch (e) {
    console.error("[auth/login]", e);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
