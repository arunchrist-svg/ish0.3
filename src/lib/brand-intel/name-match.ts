export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(pvt\.?\s*ltd\.?|private limited|limited|ltd\.?|inc\.?|corp\.?)\b/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameMatchScore(a: string, b: string): number {
  const na = normalizeCompanyName(a);
  const nb = normalizeCompanyName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.88;
  const aTokens = new Set(na.split(" "));
  const bTokens = nb.split(" ").filter((t) => t.length > 2);
  if (!bTokens.length) return 0;
  const overlap = bTokens.filter((t) => aTokens.has(t)).length;
  return overlap / bTokens.length;
}
