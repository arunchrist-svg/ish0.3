const FILE_TLDS = new Set([
  "png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp",
  "js", "css", "woff", "woff2", "ttf", "eot", "pdf", "zip", "map",
]);

const BLOCKED_EMAIL_FRAGMENTS = [
  "example.com", "sentry.io", "wixpress.com", "cloudflare.com",
  "googleusercontent.com", "schema.org", "webpack", "placeholder",
  "yourdomain", "domain.com", "email.com", "test.com", "localhost",
];

const BLOCKED_EMAIL_PATTERNS = [
  /@2x\./i, /@3x\./i, /@[0-9]+x\./i, /@[0-9.]+\.[0-9]+/,
  /\.(png|jpg|jpeg|gif|svg|webp|js|css)(\b|$)/i, /\\$/, /^\d+@/,
];

const EMAIL_REGEX = /^[a-z0-9._%+-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function isValidEmail(email: string): boolean {
  const e = email.trim().toLowerCase().replace(/\\+$/, "").replace(/[;,]+$/, "");
  if (!e || e.length > 254 || !EMAIL_REGEX.test(e)) return false;
  const [, domain] = e.split("@");
  if (!domain || domain.length > 253) return false;
  const labels = domain.split(".");
  const tld = labels[labels.length - 1];
  if (!tld || tld.length < 2 || FILE_TLDS.has(tld)) return false;
  if (labels.some((label) => !label || label.length > 63 || /^\d+$/.test(label))) return false;
  if (!/[a-z]/i.test(domain.replace(/\./g, ""))) return false;
  if (/\d{4,}/.test(domain)) return false;
  if (BLOCKED_EMAIL_FRAGMENTS.some((frag) => e.includes(frag))) return false;
  if (BLOCKED_EMAIL_PATTERNS.some((pattern) => pattern.test(e))) return false;
  if ((e.split("@")[0] ?? "").length < 2) return false;
  return true;
}

export function sanitizeEmail(email?: string | null): string | undefined {
  if (!email?.trim()) return undefined;
  const cleaned = email.trim().toLowerCase().replace(/\\+$/, "").replace(/[;,]+$/, "");
  return isValidEmail(cleaned) ? cleaned : undefined;
}

export function normalizeIndianPhoneDigits(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length >= 12) digits = digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  if (digits.startsWith("91")) return null;
  return digits;
}

function looksLikeEmbeddedId(mobile: string): boolean {
  return new Set(mobile.split("").map(Number)).size <= 3;
}

export function isValidIndianPhone(phone: string): boolean {
  const mobile = normalizeIndianPhoneDigits(phone);
  if (!mobile) return false;
  if (!/^[6-9]/.test(mobile)) return false;
  if (/^(\d)\1{9}$/.test(mobile)) return false;
  if (["1234567890", "0123456789", "9876543210"].includes(mobile)) return false;
  if (looksLikeEmbeddedId(mobile)) return false;
  return true;
}

export function sanitizePhone(phone?: string | null): string | undefined {
  if (!phone?.trim()) return undefined;
  const mobile = normalizeIndianPhoneDigits(phone);
  if (!mobile || !isValidIndianPhone(mobile)) return undefined;
  return mobile;
}

const GENERIC_EMAIL_PREFIXES = [
  "info@", "support@", "contact@", "sales@", "admin@", "hello@", "noreply@",
  "career@", "careers@", "hr@", "marketing@", "enquiry@", "inquiry@", "help@",
  "office@", "team@", "enquiries@",
];

export function isGenericCompanyEmail(email?: string | null): boolean {
  const e = sanitizeEmail(email);
  if (!e) return false;
  if (GENERIC_EMAIL_PREFIXES.some((prefix) => e.startsWith(prefix))) return true;
  const local = e.split("@")[0] ?? "";
  return /marketing|sales|support|contact|info|career|enquiry|help/i.test(local);
}

export function pickBestEmail(candidates: string[]): string | undefined {
  const valid = candidates.map(sanitizeEmail).filter(Boolean) as string[];
  if (!valid.length) return undefined;
  const personal = valid.filter((e) => !GENERIC_EMAIL_PREFIXES.some((g) => e.startsWith(g)));
  const pool = personal.length ? personal : valid;
  return pool.sort((a, b) => {
    const score = (email: string) => {
      let s = 0;
      if (!GENERIC_EMAIL_PREFIXES.some((g) => email.startsWith(g))) s += 10;
      if (email.split("@")[1]?.split(".").length === 2) s += 2;
      return s;
    };
    return score(b) - score(a);
  })[0];
}

export function pickBestPhone(candidates: string[]): string | undefined {
  return candidates.map(sanitizePhone).filter(Boolean)[0];
}
