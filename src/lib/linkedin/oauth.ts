import { randomBytes } from "crypto";

const LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

export const LINKEDIN_STATE_COOKIE = "linkedin_oauth_state";
export const LINKEDIN_MEMBER_COOKIE = "ish_linkedin_member_id";

export type LinkedInUserInfo = {
  sub: string;
  name: string;
  email?: string;
  picture?: string;
};

function getConfig() {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("LinkedIn OAuth is not configured (LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI)");
  }
  return { clientId, clientSecret, redirectUri };
}

export function generateOAuthState(): string {
  return randomBytes(24).toString("hex");
}

export function buildAuthorizationUrl(state: string): string {
  const { clientId, redirectUri } = getConfig();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid profile email",
    state,
  });
  return `${LINKEDIN_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForUser(code: string): Promise<LinkedInUserInfo> {
  const { clientId, clientSecret, redirectUri } = getConfig();

  const tokenRes = await fetch(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    throw new Error(`LinkedIn token exchange failed: ${err}`);
  }

  const tokenData = (await tokenRes.json()) as { access_token: string };
  const userRes = await fetch(LINKEDIN_USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    const err = await userRes.text();
    throw new Error(`LinkedIn userinfo failed: ${err}`);
  }

  return (await userRes.json()) as LinkedInUserInfo;
}

export function isLinkedInOAuthConfigured(): boolean {
  return !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET && process.env.LINKEDIN_REDIRECT_URI);
}
