import { randomBytes } from "crypto";

export const GOOGLE_STATE_COOKIE = "google_oauth_state";
export const GOOGLE_INVITE_COOKIE = "google_invite_token";

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function generateOAuthState(): string {
  return randomBytes(24).toString("hex");
}

function getRedirectUri(origin?: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? origin ?? "http://localhost:3002";
  return `${base.replace(/\/$/, "")}/api/auth/google/callback`;
}

export function buildGoogleAuthUrl(state: string, inviteToken?: string, origin?: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: getRedirectUri(origin),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });
  if (inviteToken) params.set("invite", inviteToken);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export type GoogleUserInfo = {
  sub: string;
  email: string;
  name: string;
  picture?: string;
};

export async function exchangeGoogleCode(code: string, origin?: string): Promise<GoogleUserInfo> {
  const redirectUri = getRedirectUri(origin);
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`Google token exchange failed: ${err}`);
  }

  const tokens = (await tokenRes.json()) as { access_token: string };
  const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userRes.ok) throw new Error("Failed to fetch Google user info");
  const user = (await userRes.json()) as GoogleUserInfo;
  if (!user.email) throw new Error("Google account has no email");
  return user;
}
