import { NextResponse } from "next/server";
import { db, users } from "@/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/password";
import { acceptInvite } from "@/lib/auth/invites";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { getSessionTokenFromCookies, getSessionUser } from "@/lib/auth/session";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token, name, password, email } = body as {
      token?: string;
      name?: string;
      password?: string;
      email?: string;
    };

    if (!token) return NextResponse.json({ error: "Invite token required" }, { status: 400 });

    const tokenExisting = await getSessionTokenFromCookies();
    const sessionUser = await getSessionUser(tokenExisting);

    let userId = sessionUser?.id;

    if (!userId) {
      if (!email?.trim() || !password || password.length < 8 || !name?.trim()) {
        return NextResponse.json({ error: "Name, email, and password required" }, { status: 400 });
      }
      const normalizedEmail = email.trim().toLowerCase();
      const existing = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
      if (existing.length) {
        return NextResponse.json({ error: "Account exists — sign in first" }, { status: 409 });
      }
      const passwordHash = await hashPassword(password);
      const [user] = await db
        .insert(users)
        .values({ email: normalizedEmail, passwordHash, name: name.trim() })
        .returning();
      userId = user.id;
    }

    const accepted = await acceptInvite({ token, userId });
    const sessionToken = await createSession(userId, accepted.tenantId);
    const res = NextResponse.json({ ok: true, redirect: accepted.redirect });
    res.cookies.set(SESSION_COOKIE, sessionToken, sessionCookieOptions(sessionToken));
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to accept invite";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
