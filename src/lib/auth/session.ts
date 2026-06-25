import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { db, sessions, users } from "@/db";
import { eq, and, gt } from "drizzle-orm";

export const SESSION_COOKIE = "ish_token";
const SESSION_DAYS = 30;

export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export async function createSession(userId: string): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({ token, userId, expiresAt });
  return token;
}

export async function deleteSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, token));
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export async function getSessionUser(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name };
}

export async function getSessionTokenFromCookies(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value;
}

export function sessionCookieOptions(token: string) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  };
}

export function clearSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  };
}
