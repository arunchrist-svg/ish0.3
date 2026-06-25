import { NextResponse } from "next/server";
import { db, users, tenants, orgMembers } from "@/db";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body as { email?: string; password?: string };

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

    const [membership] = await db
      .select({ onboardingStatus: tenants.onboardingStatus })
      .from(orgMembers)
      .innerJoin(tenants, eq(tenants.id, orgMembers.tenantId))
      .where(eq(orgMembers.userId, user.id))
      .limit(1);

    const redirect = membership?.onboardingStatus === "complete" ? "/" : "/onboarding";

    const token = await createSession(user.id);
    const res = NextResponse.json({ ok: true, redirect });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(token));
    return res;
  } catch (e) {
    console.error("[auth/login]", e);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
