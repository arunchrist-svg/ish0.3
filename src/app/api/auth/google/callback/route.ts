import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db, users } from "@/db";
import { eq } from "drizzle-orm";
import {
  exchangeGoogleCode,
  GOOGLE_INVITE_COOKIE,
  GOOGLE_STATE_COOKIE,
} from "@/lib/auth/google";
import { acceptInvite, findPendingInviteForEmail } from "@/lib/auth/invites";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { orgMembers } from "@/db";
import { resolvePostAuthDestination } from "@/lib/auth/post-auth-redirect";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const cookieStore = await cookies();
  const savedState = cookieStore.get(GOOGLE_STATE_COOKIE)?.value;
  const inviteToken = cookieStore.get(GOOGLE_INVITE_COOKIE)?.value;
  cookieStore.delete(GOOGLE_STATE_COOKIE);
  cookieStore.delete(GOOGLE_INVITE_COOKIE);

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=google_${error}`, url.origin));
  }

  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL("/login?error=google_invalid_state", url.origin));
  }

  try {
    const googleUser = await exchangeGoogleCode(code, url.origin);
    const normalizedEmail = googleUser.email.trim().toLowerCase();

    let [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

    if (!user) {
      const byGoogle = await db.select().from(users).where(eq(users.googleId, googleUser.sub)).limit(1);
      user = byGoogle[0];
    }

    if (!user) {
      [user] = await db
        .insert(users)
        .values({
          email: normalizedEmail,
          name: googleUser.name || normalizedEmail.split("@")[0],
          googleId: googleUser.sub,
          platformRole: "user",
        })
        .returning();
    } else if (!user.googleId) {
      await db.update(users).set({ googleId: googleUser.sub }).where(eq(users.id, user.id));
    }

    const membership = await db.query.orgMembers.findFirst({
      where: (m, { eq }) => eq(m.userId, user.id),
    });

    const effectiveInviteToken =
      inviteToken ?? (membership ? null : await findPendingInviteForEmail(normalizedEmail));

    if (effectiveInviteToken) {
      try {
        await acceptInvite({ token: effectiveInviteToken, userId: user.id });
      } catch (err) {
        const message = err instanceof Error ? err.message : "invite_failed";
        const code = message.includes("does not match") ? "google_invite_email_mismatch" : "google_invite_failed";
        return NextResponse.redirect(new URL(`/login?error=${code}`, url.origin));
      }
      const { redirect, tenantId } = await resolvePostAuthDestination({
        userId: user.id,
        platformRole: user.platformRole,
        mustChangePassword: user.mustChangePassword,
      });
      const token = await createSession(user.id, tenantId);
      const res = NextResponse.redirect(new URL(redirect, url.origin));
      res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(token));
      return res;
    }

    if (!membership) {
      return NextResponse.redirect(new URL("/login?error=invite_required", url.origin));
    }

    const { redirect, tenantId } = await resolvePostAuthDestination({
      userId: user.id,
      platformRole: user.platformRole,
      mustChangePassword: user.mustChangePassword,
    });

    const token = await createSession(user.id, tenantId);
    const res = NextResponse.redirect(new URL(redirect, url.origin));
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(token));
    return res;
  } catch (e) {
    console.error("[google/callback]", e);
    return NextResponse.redirect(new URL("/login?error=google_failed", url.origin));
  }
}
