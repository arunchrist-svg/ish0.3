import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  buildAuthorizationUrl,
  generateOAuthState,
  isLinkedInOAuthConfigured,
  LINKEDIN_STATE_COOKIE,
} from "@/lib/linkedin/oauth";

export async function GET() {
  if (!isLinkedInOAuthConfigured()) {
    return NextResponse.json({ error: "LinkedIn OAuth is not configured" }, { status: 503 });
  }

  const state = generateOAuthState();
  const cookieStore = await cookies();
  cookieStore.set(LINKEDIN_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(buildAuthorizationUrl(state));
}
