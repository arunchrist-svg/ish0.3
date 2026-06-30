import type { ScoutPersonResult } from "./types";

const TITLE_PATTERNS: { rank: number; patterns: RegExp[] }[] = [
  { rank: 100, patterns: [/\bceo\b/i, /\bcfo\b/i, /\bcto\b/i, /\bcpo\b/i, /\bcoo\b/i, /\bchief\b/i, /\bfounder\b/i, /\bco-founder\b/i, /\bmanaging director\b/i, /\bmd\b/i, /\bpresident\b/i] },
  { rank: 85, patterns: [/\bvp\b/i, /\bvice president\b/i, /\bsvp\b/i, /\bevp\b/i] },
  { rank: 70, patterns: [/\bdirector\b/i, /\bdir\.\b/i] },
  { rank: 65, patterns: [/\bhead of\b/i, /\bhead\b/i] },
  { rank: 50, patterns: [/\bmanager\b/i, /\bmgr\b/i] },
  { rank: 35, patterns: [/\bsenior\b/i, /\bsr\.\b/i, /\blead\b/i] },
  { rank: 20, patterns: [/\bassociate\b/i, /\bexecutive\b/i, /\bcoordinator\b/i, /\bspecialist\b/i, /\banalyst\b/i] },
  { rank: 5, patterns: [/\bentry\b/i, /\bjunior\b/i, /\bjr\.\b/i, /\btrainee\b/i] },
  { rank: 0, patterns: [/\bintern\b/i, /\bapprentice\b/i] },
];

const APOLLO_SENIORITY_RANK: Record<string, number> = {
  c_suite: 100,
  founder: 100,
  owner: 100,
  partner: 95,
  vp: 85,
  head: 65,
  director: 70,
  manager: 50,
  senior: 35,
  entry: 5,
  intern: 0,
};

export type SeniorityScoreFactors = {
  base: number;
  keyDmBonus: number;
  emailBonus: number;
  linkedInBonus: number;
  total: number;
  label: string;
};

function rankFromTitle(title?: string | null): { rank: number; label: string } {
  if (!title?.trim()) return { rank: 20, label: "Unknown" };
  for (const { rank, patterns } of TITLE_PATTERNS) {
    if (patterns.some((p) => p.test(title))) {
      const label =
        rank >= 100 ? "C-Suite" : rank >= 85 ? "VP" : rank >= 70 ? "Director" : rank >= 65 ? "Head" : rank >= 50 ? "Manager" : rank >= 35 ? "Senior" : rank === 0 ? "Intern" : "Individual";
      return { rank, label };
    }
  }
  return { rank: 20, label: "Individual" };
}

function rankFromApolloSeniority(seniority?: string | null): number | null {
  if (!seniority) return null;
  const key = seniority.toLowerCase().replace(/\s+/g, "_");
  return APOLLO_SENIORITY_RANK[key] ?? null;
}

export function computeSeniorityScore(person: {
  title?: string | null;
  seniority?: string | null;
  isKeyDM?: boolean;
  email?: string | null;
  emailStatus?: string;
  linkedIn?: string | null;
}): SeniorityScoreFactors {
  const fromTitle = rankFromTitle(person.title);
  const fromApollo = rankFromApolloSeniority(person.seniority);
  const base = fromApollo != null ? Math.max(fromTitle.rank, fromApollo) : fromTitle.rank;

  const keyDmBonus = person.isKeyDM ? 10 : 0;
  const emailBonus = person.email && person.emailStatus !== "missing" ? 5 : 0;
  const linkedInBonus = person.linkedIn ? 3 : 0;
  const total = Math.min(100, base + keyDmBonus + emailBonus + linkedInBonus);

  return { base, keyDmBonus, emailBonus, linkedInBonus, total, label: fromTitle.label };
}

export function scorePerson(person: ScoutPersonResult): ScoutPersonResult {
  const factors = computeSeniorityScore(person);
  return { ...person, matchScore: factors.total };
}

export function sortPeopleByScore(people: ScoutPersonResult[]): ScoutPersonResult[] {
  return [...people].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
}

export function formatScoreTooltip(factors: SeniorityScoreFactors): string {
  const parts = [`Seniority: ${factors.base}`];
  if (factors.keyDmBonus) parts.push(`Key DM: +${factors.keyDmBonus}`);
  if (factors.emailBonus) parts.push(`Email: +${factors.emailBonus}`);
  if (factors.linkedInBonus) parts.push(`LinkedIn: +${factors.linkedInBonus}`);
  return parts.join(" · ");
}
