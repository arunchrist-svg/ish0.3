import { NextResponse } from "next/server";
import { db, users } from "@/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/password";
import { acceptInvite, getInviteByToken } from "@/lib/auth/invites";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { provisionNewTenant } from "@/lib/auth/provision";

function isInviteOnly(): boolean {
  return process.env.INVITE_ONLY !== "false";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, name, orgName, workspaceName, inviteToken } = body as {
      email?: string;
      password?: string;
      name?: string;
      orgName?: string;
      workspaceName?: string;
      inviteToken?: string;
    };

    if (!email?.trim() || !password || password.length < 8 || !name?.trim()) {
      return NextResponse.json(
        { error: "Name, email, and password (8+ chars) are required" },
        { status: 400 },
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (inviteToken) {
      const invite = await getInviteByToken(inviteToken);
      if (!invite) {
        return NextResponse.json({ error: "Invite link is invalid or expired" }, { status: 400 });
      }
      if (normalizedEmail !== invite.email.toLowerCase()) {
        return NextResponse.json({ error: "Use the email address you were invited with" }, { status: 400 });
      }

      const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
      if (existing.length) {
        return NextResponse.json({ error: "Account already exists — sign in instead" }, { status: 409 });
      }

      const passwordHash = await hashPassword(password);
      const [user] = await db
        .insert(users)
        .values({ email: normalizedEmail, passwordHash, name: name.trim() })
        .returning();

      await acceptInvite({ token: inviteToken, userId: user.id });

      const token = await createSession(user.id);
      const res = NextResponse.json({ ok: true, redirect: "/" });
      res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(token));
      return res;
    }

    if (isInviteOnly()) {
      return NextResponse.json(
        { error: "You need an invite link to sign up." },
        { status: 403 },
      );
    }

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existing.length) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);

    const [user] = await db
      .insert(users)
      .values({ email: normalizedEmail, passwordHash, name: name.trim() })
      .returning();

    await provisionNewTenant({
      userId: user.id,
      orgName: orgName?.trim() || `${name.trim()}'s Organization`,
      workspaceName: workspaceName?.trim() || "Main Workspace",
    });

    const token = await createSession(user.id);
    const res = NextResponse.json({ ok: true, redirect: "/onboarding" });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(token));
    return res;
  } catch (e) {
    console.error("[auth/signup]", e);
    return NextResponse.json({ error: "Signup failed" }, { status: 500 });
  }
}
