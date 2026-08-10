const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "before",
  "for",
  "from",
  "hi",
  "if",
  "in",
  "is",
  "it",
  "no",
  "not",
  "of",
  "on",
  "or",
  "our",
  "the",
  "this",
  "to",
  "we",
  "with",
  "would",
  "you",
  "your",
]);

export const BASELINE_PARAPHRASE_THRESHOLD = 0.58;
export const SEQUENCE_CLONE_THRESHOLD = 0.58;

export function extractEmailHook(body: string): string {
  const parts = body
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const start = /^hi\s/i.test(parts[0] ?? "") ? 1 : 0;
  return parts[start] ?? stripEmailChrome(body);
}

export function stripEmailChrome(body: string): string {
  const lines = body
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^hi\s+[^,]+,?$/i.test(l))
    .filter((l) => !/^partnerships,/i.test(l))
    .filter((l) => !/^(best|warm)?\s*regards,?$/i.test(l));
  if (lines.length >= 2 && lines[lines.length - 1].split(/\s+/).length <= 4) {
    lines.pop();
  }
  return lines.join(" ");
}

export function tokenizeForOverlap(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

export function tokenOverlapRatio(a: string, b: string): number {
  const left = tokenizeForOverlap(a);
  const right = tokenizeForOverlap(b);
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) {
    if (right.has(token)) overlap += 1;
  }
  return overlap / (left.size + right.size - overlap);
}

export function isNearParaphrase(
  a: string,
  b: string,
  threshold: number = BASELINE_PARAPHRASE_THRESHOLD,
  mode: "full" | "hook" = "full",
): boolean {
  const left = mode === "hook" ? extractEmailHook(a) : stripEmailChrome(a);
  const right = mode === "hook" ? extractEmailHook(b) : stripEmailChrome(b);
  if (!left.trim() || !right.trim()) return false;
  return tokenOverlapRatio(left, right) >= threshold;
}
