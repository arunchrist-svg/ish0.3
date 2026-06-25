import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteSession, SESSION_COOKIE, clearSessionCookieOptions } from "@/lib/auth/session";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", clearSessionCookieOptions());
  return res;
}
