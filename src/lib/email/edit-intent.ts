export type EditIntent = "surgical" | "global";

const GLOBAL_PATTERNS = [
  /\bmake it shorter\b/i,
  /\bmore formal\b/i,
  /\bstronger cta\b/i,
  /\bcontent score\b/i,
  /\brewrite\b/i,
  /\bstart over\b/i,
  /\bregenerate\b/i,
  /\bredo\b/i,
  /\bwhole email\b/i,
  /\bentire email\b/i,
  /\bfrom scratch\b/i,
];

const SURGICAL_PATTERNS = [
  /\b(fix|change|update|replace|edit|correct|revise|modify)\b.{0,40}\b(line|section|paragraph|sentence|part|bit|word|phrase|opening|closing|greeting|sign[- ]?off)\b/i,
  /\b(line|section|paragraph|sentence|part|opening|closing|greeting)\b.{0,30}\b(fix|change|update|replace|edit)\b/i,
  /\b(only|just)\b.{0,20}\b(change|fix|update|replace|edit)\b/i,
  /\b(change|fix|update|replace|edit)\b.{0,20}\b(this|that|the)\b/i,
  /\b(first|second|third|last|next)\b.{0,15}\b(paragraph|line|sentence)\b/i,
  /["'][^"']{3,}["']/,
  /\bwhere it says\b/i,
  /\binstead of\b/i,
];

const SUBJECT_PATTERNS = [
  /\bsubject\b/i,
  /\btitle\b/i,
  /\bsubject line\b/i,
  /\bgreeting\b/i,
  /\bsalutation\b/i,
  /\bopening line\b/i,
];

export function detectEditIntent(message: string): EditIntent {
  const trimmed = message.trim();
  if (!trimmed) return "surgical";

  if (GLOBAL_PATTERNS.some((p) => p.test(trimmed))) return "global";

  if (SURGICAL_PATTERNS.some((p) => p.test(trimmed))) return "surgical";

  // Ambiguous short messages default to surgical (safer)
  return "surgical";
}

export function mentionsSubject(message: string): boolean {
  return SUBJECT_PATTERNS.some((p) => p.test(message));
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Returns fraction of words in `before` that are absent from `after` (0 = identical, 1 = fully different). */
export function bodyChangeRatio(before: string, after: string): number {
  const beforeTokens = tokenize(before);
  const afterSet = new Set(tokenize(after));
  if (beforeTokens.length === 0) return after.trim() === before.trim() ? 0 : 1;

  let changed = 0;
  for (const token of beforeTokens) {
    if (!afterSet.has(token)) changed++;
  }
  return changed / beforeTokens.length;
}
