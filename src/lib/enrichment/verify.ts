import { promises as dns } from "dns";
import type { EmailVerifyResult } from "./types";

const GENERIC_PREFIXES = [
  "info@", "hr@", "admin@", "contact@", "office@", "sales@",
  "hello@", "support@", "team@", "help@", "enquiry@", "enquiries@",
];

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
  try {
    const records = await dns.resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
}

async function hunterVerify(email: string): Promise<"verified" | "unverified" | null> {
  const key = process.env.HUNTER_API_KEY;
  if (!key) return null;

  try {
    const res = await fetch(
      `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${key}`,
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
}

export async function verifyEmail(email: string): Promise<EmailVerifyResult> {
  if (!email || !isValidFormat(email)) {
    return { email, status: "missing", isPersonal: false };
  }

  if (isGenericEmail(email)) {
    return { email, status: "generic", isPersonal: false };
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
