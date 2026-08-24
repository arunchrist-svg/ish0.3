import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteSession, SESSION_COOKIE, clearSessionCookieOptions } from "@/lib/auth/session";
import { SEALED_SESSION_COOKIE, clearSealedSessionCookieOptions } from "@/lib/auth/sealed-session";
import { clearTenantContextCache } from "@/lib/tenant";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  clearTenantContextCache();

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", clearSessionCookieOptions());
  res.cookies.set(SEALED_SESSION_COOKIE, "", clearSealedSessionCookieOptions());
  return res;
}
