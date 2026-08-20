import { promises as dns } from "dns";
import type { EmailVerifyResult } from "./types";

const GENERIC_PREFIXES = [
  "info@", "hr@", "admin@", "contact@", "office@", "sales@",
  "hello@", "support@", "team@", "help@", "enquiry@", "enquiries@",
];

const mxCache = new Map<string, Promise<boolean | null>>();
const hunterCache = new Map<string, Promise<"verified" | "unverified" | null>>();

function isGenericEmail(email: string): boolean {
  return GENERIC_PREFIXES.some((p) => email.toLowerCase().startsWith(p));
}

function isValidFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    !email.includes("logo") &&
    !email.includes("webpack") &&
    !email.includes(".png") &&
    !email.includes(".jpg");
}

async function domainHasMx(email: string): Promise<boolean | null> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  const cached = mxCache.get(domain);
  if (cached) return cached;

  const promise = (async (): Promise<boolean | null> => {
    try {
      const records = await dns.resolveMx(domain);
      return records.length > 0;
    } catch {
      return false;
    }
  })();
  mxCache.set(domain, promise);
  return promise;
}

async function hunterVerify(email: string): Promise<"verified" | "unverified" | null> {
  const key = process.env.HUNTER_API_KEY;
  if (!key) return null;

  const normalized = email.toLowerCase().trim();
  const cached = hunterCache.get(normalized);
  if (cached) return cached;

  const promise = (async (): Promise<"verified" | "unverified" | null> => {
    try {
      const res = await fetch(
        `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(normalized)}&api_key=${key}`,
      );
      if (!res.ok) return null;
      const data = await res.json();
      const status = data.data?.status;
      if (status === "valid") return "verified";
      if (status === "invalid" || status === "disposable") return "unverified";
      return null;
    } catch {
      return null;
    }
  })();
  hunterCache.set(normalized, promise);
  return promise;
}

export async function verifyEmail(
  email: string,
  options?: { network?: boolean },
): Promise<EmailVerifyResult> {
  if (!email || !isValidFormat(email)) {
    return { email, status: "missing", isPersonal: false };
  }

  if (isGenericEmail(email)) {
    return { email, status: "generic", isPersonal: false };
  }

  if (options?.network === false) {
    return { email, status: "unverified", isPersonal: true, provider: "format" };
  }

  // Hunter verify (best accuracy, optional)
  const hunterResult = await hunterVerify(email);
  if (hunterResult === "verified") {
    return { email, status: "verified", isPersonal: true, provider: "hunter" };
  }
  if (hunterResult === "unverified") {
    return { email, status: "unverified", isPersonal: true, provider: "hunter" };
  }

  // Free MX check — domain must accept mail
  const hasMx = await domainHasMx(email);
  if (hasMx === false) {
    return { email, status: "unverified", isPersonal: true, provider: "mx" };
  }

  // Format + MX passed, no paid verify API available
  return { email, status: "unverified", isPersonal: true, provider: hasMx ? "mx+format" : "format" };
}

export function verifyGate(result: EmailVerifyResult): boolean {
  // Save is blocked if: no email, generic with no personal option
  if (result.status === "missing") return false;
  return true; // generic emails pass but are flagged — CM decides
}
