import { NextResponse } from "next/server";
import { db, users } from "@/db";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { listActiveMemberships } from "@/lib/tenant";
import { normalizeTenantSlug } from "@/lib/auth/slug";
import { resolvePostAuthDestination } from "@/lib/auth/post-auth-redirect";

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

    const memberships = await listActiveMemberships(user.id);
    if (memberships.length === 0 && user.platformRole !== "superadmin") {
      return NextResponse.json({ error: "No organization membership found" }, { status: 401 });
    }

    let tenantId: string | null = null;
    let role: string | undefined;

    if (memberships.length === 1) {
      tenantId = memberships[0]!.tenantId;
      role = memberships[0]!.role;
    } else if (memberships.length > 1) {
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

    const { redirect, tenantId: sessionTenantId } = await resolvePostAuthDestination({
      userId: user.id,
      platformRole: user.platformRole,
      mustChangePassword: user.mustChangePassword,
      tenantId,
      role,
    });

    const token = await createSession(user.id, sessionTenantId);
    const res = NextResponse.json({ ok: true, redirect });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(token));
    return res;
  } catch (e) {
    console.error("[auth/login]", e);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
