import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  buildGoogleAuthUrl,
  generateOAuthState,
  GOOGLE_INVITE_COOKIE,
  GOOGLE_STATE_COOKIE,
  isGoogleOAuthConfigured,
} from "@/lib/auth/google";

export async function GET(req: Request) {
  if (!isGoogleOAuthConfigured()) {
    const accept = req.headers.get("accept") ?? "";
    if (accept.includes("application/json")) {
      return NextResponse.json({ error: "Google OAuth is not configured" }, { status: 503 });
    }
    return NextResponse.redirect(new URL("/login?error=google_oauth_not_configured", req.url));
  }

  const url = new URL(req.url);
  const inviteToken = url.searchParams.get("invite") ?? undefined;
  const state = generateOAuthState();
  const origin = url.origin;

  const cookieStore = await cookies();
  cookieStore.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  if (inviteToken) {
    cookieStore.set(GOOGLE_INVITE_COOKIE, inviteToken, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
  }

  return NextResponse.redirect(buildGoogleAuthUrl(state, inviteToken, origin));
}
