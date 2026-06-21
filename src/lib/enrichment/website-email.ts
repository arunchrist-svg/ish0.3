/**
 * Website Email Enrichment
 * Fetches a company's website and extracts contact emails from:
 *   - mailto: links
 *   - Email patterns in page text
 *   - /contact, /about, /team pages
 * 100% free — no external API needed.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const GENERIC_PREFIXES = new Set([
  "info", "hr", "admin", "contact", "office", "sales", "hello",
  "support", "team", "help", "enquiry", "enquiries", "careers",
  "jobs", "noreply", "no-reply", "webmaster", "service", "billing",
]);

const CONTACT_PATHS = ["/contact", "/contact-us", "/about", "/team", "/about-us", "/reach-us"];

type EmailCandidate = {
  email: string;
  isPersonal: boolean;
  source: string;
};

async function fetchPage(url: string, timeoutMs = 5000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ISH-Scout/1.0)",
        Accept: "text/html",
      },
    });
    if (!res.ok) return "";
    const text = await res.text();
    return text.slice(0, 80_000); // cap at 80KB
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function extractEmails(html: string, sourcePath: string): EmailCandidate[] {
  const found = new Map<string, EmailCandidate>();

  // Decode HTML entities
  const decoded = html
    .replace(/&amp;/g, "&")
    .replace(/&#64;/g, "@")
    .replace(/\[at\]/gi, "@")
    .replace(/\(at\)/gi, "@")
    .replace(/\s+at\s+/gi, "@");

  const matches = decoded.match(EMAIL_RE) ?? [];
  for (const raw of matches) {
    const email = raw.toLowerCase().trim();
    if (email.length > 80) continue;
    if (email.includes("..")) continue;
    if (!email.includes(".")) continue;
    // Skip image/asset extensions
    if (/\.(png|jpg|gif|svg|css|js|ico)$/.test(email)) continue;

    const local = email.split("@")[0];
    const isPersonal = !GENERIC_PREFIXES.has(local);

    if (!found.has(email)) {
      found.set(email, { email, isPersonal, source: sourcePath });
    }
  }

  return Array.from(found.values());
}

export type WebsiteEmailResult = {
  emails: EmailCandidate[];
  bestEmail: string | null;
  isPersonal: boolean;
};

export async function scrapeWebsiteEmails(domain: string): Promise<WebsiteEmailResult> {
  if (!domain) return { emails: [], bestEmail: null, isPersonal: false };

  const base = domain.startsWith("http") ? domain : `https://${domain}`;
  const allCandidates: EmailCandidate[] = [];

  // Always fetch homepage
  const homepage = await fetchPage(base);
  allCandidates.push(...extractEmails(homepage, "/"));

  // Try contact pages if we don't have a personal email yet
  const hasPersonal = allCandidates.some((c) => c.isPersonal);
  if (!hasPersonal) {
    for (const path of CONTACT_PATHS.slice(0, 3)) {
      try {
        const page = await fetchPage(`${base}${path}`);
        if (page) {
          allCandidates.push(...extractEmails(page, path));
          if (allCandidates.some((c) => c.isPersonal)) break;
        }
      } catch {
        // skip
      }
    }
  }

  // Dedupe
  const unique = new Map<string, EmailCandidate>();
  for (const c of allCandidates) {
    if (!unique.has(c.email)) unique.set(c.email, c);
  }

  const emails = Array.from(unique.values());

  // Prefer personal emails first, then generic
  const personal = emails.filter((e) => e.isPersonal);
  const generic = emails.filter((e) => !e.isPersonal);

  // Filter obvious junk
  const filtered = [...personal, ...generic].filter((e) => {
    const domain = e.email.split("@")[1];
    return domain && domain.includes(".") && !domain.includes("sentry") && !domain.includes("example");
  });

  const best = filtered[0] ?? null;

  return {
    emails: filtered.slice(0, 10),
    bestEmail: best?.email ?? null,
    isPersonal: best?.isPersonal ?? false,
  };
}
