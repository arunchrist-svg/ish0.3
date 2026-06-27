import { NextResponse } from "next/server";
import { db, users } from "@/db";
import { eq } from "drizzle-orm";
import { getSessionTokenFromCookies, getSessionUser } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { UnauthorizedError } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";

export async function POST(req: Request) {
  try {
    const token = await getSessionTokenFromCookies();
    const sessionUser = await getSessionUser(token);
    if (!sessionUser) throw new UnauthorizedError();

    const body = (await req.json()) as { currentPassword?: string; newPassword?: string };
    if (!body.newPassword || body.newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
    }

    const [user] = await db.select().from(users).where(eq(users.id, sessionUser.id)).limit(1);
    if (!user?.passwordHash) {
      return NextResponse.json({ error: "Password change not available for this account" }, { status: 400 });
    }

    if (!user.mustChangePassword) {
      if (!body.currentPassword) {
        return NextResponse.json({ error: "Current password required" }, { status: 400 });
      }
      const valid = await verifyPassword(body.currentPassword, user.passwordHash);
      if (!valid) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
      }
    }

    const passwordHash = await hashPassword(body.newPassword);
    await db
      .update(users)
      .set({ passwordHash, mustChangePassword: false })
      .where(eq(users.id, user.id));

    return NextResponse.json({ ok: true, redirect: "/" });
  } catch (e) {
    return handleApiError(e, "[auth/change-password]");
  }
}
