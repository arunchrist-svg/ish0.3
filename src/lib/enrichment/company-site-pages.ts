/**
 * Public company pages a human would open after Google: home, about, leadership, team.
 */
import type { WebSearchHit } from "./web-search";

const PAGE_PATHS = ["/", "/about", "/about-us", "/leadership", "/team", "/our-team"];
const FETCH_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 200_000;
const MAX_TEXT_CHARS = 4_000;

function isPublicHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
    if (/^127\./.test(host) || host === "0.0.0.0" || host === "::1") return false;
    if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function companySiteBaseUrl(website?: string, domain?: string): string | null {
  const raw = website?.trim() || (domain?.trim() ? `https://${domain.trim()}` : "");
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (!isPublicHttpUrl(url.toString())) return null;
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export function htmlToVisibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_CHARS);
}

async function fetchPage(url: string): Promise<WebSearchHit | null> {
  if (!isPublicHttpUrl(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "ISH-Scout/1.0 (people discovery; +https://indiasweethouse.in)",
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !/html|xml|text\/plain/i.test(contentType)) return null;
    const buf = await res.arrayBuffer();
    const slice = buf.byteLength > MAX_HTML_BYTES ? buf.slice(0, MAX_HTML_BYTES) : buf;
    const html = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    const content = htmlToVisibleText(html);
    if (content.length < 40) return null;
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch?.[1] ? htmlToVisibleText(titleMatch[1]).slice(0, 180) : url;
    return { title, url: res.url || url, content };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch a few public leadership/about pages. Skips private hosts. */
export async function fetchCompanyLeadershipPages(params: {
  website?: string;
  domain?: string;
}): Promise<WebSearchHit[]> {
  const base = companySiteBaseUrl(params.website, params.domain);
  if (!base) return [];

  const hits = await Promise.all(PAGE_PATHS.map((path) => fetchPage(`${base}${path}`)));
  const seen = new Set<string>();
  const out: WebSearchHit[] = [];
  for (const hit of hits) {
    if (!hit) continue;
    const key = hit.url.toLowerCase().replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}
