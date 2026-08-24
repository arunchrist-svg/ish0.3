import { createHmac, timingSafeEqual } from "crypto";

export const SEALED_SESSION_COOKIE = "ish_ctx";
const SEAL_TTL_MS = 30 * 60 * 1000; // 30 minutes

export type SealedTenantClaims = {
  userId: string;
  tenantId: string;
  workspaceId: string;
  role: string;
  platformRole: string;
  tenantSlug: string;
  onboardingStatus: string;
  onboardingStep: number;
  demoMode: boolean;
  mustChangePassword: boolean;
  exp: number;
};

function sealSecret(): string {
  return (
    process.env.SESSION_SEAL_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.DATABASE_URL?.slice(0, 48) ||
    "ish-dev-seal-secret"
  );
}

function sign(payloadB64: string): string {
  return createHmac("sha256", sealSecret()).update(payloadB64).digest("base64url");
}

export function sealTenantClaims(
  claims: Omit<SealedTenantClaims, "exp">,
  ttlMs = SEAL_TTL_MS,
): string {
  const body: SealedTenantClaims = { ...claims, exp: Date.now() + ttlMs };
  const payloadB64 = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function unsealTenantClaims(token: string | undefined): SealedTenantClaims | null {
  if (!token?.includes(".")) return null;
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  const expected = sign(payloadB64);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const body = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as SealedTenantClaims;
    if (!body?.userId || !body.tenantId || !body.workspaceId || !body.exp) return null;
    if (body.exp < Date.now()) return null;
    return body;
  } catch {
    return null;
  }
}

export function sealedSessionCookieOptions(_token: string) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: Math.floor(SEAL_TTL_MS / 1000),
    path: "/",
  };
}

export function clearSealedSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  };
}
