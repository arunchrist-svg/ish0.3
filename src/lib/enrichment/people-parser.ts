import type { ScoutPersonResult } from "./types";
import { normalizeLinkedInUrl } from "@/lib/utils";

type SearchHit = { title: string; url: string; content: string };

const LINKEDIN_IN_RE = /(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/in\/([a-zA-Z0-9%-]+)/gi;
const JUNK_NAME =
  /^(linkedin|profile|people|team|about|contact|home|sign in|login|unknown)$/i;

function slugToName(slug: string): string | null {
  const decoded = decodeURIComponent(slug).replace(/-/g, " ").trim();
  const name = decoded
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
  if (name.length < 4 || name.length > 60) return null;
  if (JUNK_NAME.test(name)) return null;
  if (/^\d+$/.test(name)) return null;
  return name;
}

function parseLinkedInTitle(title: string): { name?: string; title?: string } {
  const cleaned = title
    .replace(/\s*[|\-–—]\s*LinkedIn.*$/i, "")
    .replace(/\s*on LinkedIn.*$/i, "")
    .trim();
  const parts = cleaned.split(/\s*[|\-–—]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { name: parts[0], title: parts.slice(1).join(" · ") };
  }
  return parts[0] ? { name: parts[0] } : {};
}

function isKeyDM(title?: string): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return ["hr", "admin", "procurement", "chief", "director", "head", "vp", "manager", "people"].some(
    (k) => t.includes(k),
  );
}

function collectLinkedInHits(hits: SearchHit[]): { name: string; title?: string; linkedIn: string }[] {
  const out: { name: string; title?: string; linkedIn: string }[] = [];
  const seen = new Set<string>();

  for (const hit of hits) {
    const blob = `${hit.title}\n${hit.url}\n${hit.content}`;
    const fromTitle = parseLinkedInTitle(hit.title);

    for (const match of blob.matchAll(LINKEDIN_IN_RE)) {
      const slug = match[1]?.split("?")[0] ?? "";
      const linkedIn = normalizeLinkedInUrl(`linkedin.com/in/${slug}`);
      if (!linkedIn) continue;

      const key = linkedIn.toLowerCase();
      if (seen.has(key)) continue;

      const name = fromTitle.name && fromTitle.name.length >= 4
        ? fromTitle.name
        : slugToName(slug);
      if (!name || JUNK_NAME.test(name)) continue;

      seen.add(key);
      out.push({ name, title: fromTitle.title, linkedIn });
    }
  }

  return out;
}

/** Heuristic fallback when LLM people extraction is unavailable or returns nothing. */
export function parsePeopleFromSearchResults(
  hits: SearchHit[],
  limit: number,
  dataSource = "web_heuristic",
): ScoutPersonResult[] {
  const candidates = collectLinkedInHits(hits);
  return candidates.slice(0, limit).map((c) => ({
    name: c.name,
    title: c.title,
    linkedIn: c.linkedIn,
    email: undefined,
    emailStatus: "missing" as const,
    isKeyDM: isKeyDM(c.title),
    matchScore: isKeyDM(c.title) ? 62 : 52,
    dataSource,
  }));
}
