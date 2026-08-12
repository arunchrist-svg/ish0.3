import type { ColumnMapping, NormalizedImportRow } from "./types";

function cell(row: Record<string, string>, mapping: ColumnMapping, field: string): string {
  for (const [header, target] of Object.entries(mapping)) {
    if (target === field) return (row[header] ?? "").trim();
  }
  return "";
}

function parseScore(raw: string): number | undefined {
  if (!raw) return undefined;
  const n = Number(String(raw).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function parseTags(raw: string): string[] | undefined {
  if (!raw.trim()) return undefined;
  const tags = raw
    .split(/[,;|]/)
    .map((t) => t.trim())
    .filter(Boolean);
  return tags.length ? tags : undefined;
}

export function applyColumnMapping(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
): { rows: NormalizedImportRow[]; invalid: { rowIndex: number; reason: string }[] } {
  const result: NormalizedImportRow[] = [];
  const invalid: { rowIndex: number; reason: string }[] = [];

  rows.forEach((row, index) => {
    const rowIndex = index + 2; // 1-based sheet row including header
    const firstName = cell(row, mapping, "firstName");
    const lastName = cell(row, mapping, "lastName");
    const fullName = cell(row, mapping, "name");
    const name = (fullName || [firstName, lastName].filter(Boolean).join(" ")).trim();
    const company = cell(row, mapping, "company");

    if (!name || !company) {
      invalid.push({
        rowIndex,
        reason: !name && !company ? "Missing name and company" : !name ? "Missing name" : "Missing company",
      });
      return;
    }

    const scoreRaw = cell(row, mapping, "score");
    const tagsRaw = cell(row, mapping, "tags");

    result.push({
      rowIndex,
      name,
      company,
      title: cell(row, mapping, "title") || undefined,
      email: cell(row, mapping, "email") || undefined,
      phone: cell(row, mapping, "phone") || undefined,
      linkedIn: cell(row, mapping, "linkedIn") || undefined,
      city: cell(row, mapping, "city") || undefined,
      industry: cell(row, mapping, "industry") || undefined,
      employees: cell(row, mapping, "employees") || undefined,
      score: parseScore(scoreRaw),
      tags: parseTags(tagsRaw),
      rating: cell(row, mapping, "rating") || undefined,
      owner: cell(row, mapping, "owner") || undefined,
    });
  });

  return { rows: result, invalid };
}

export function mappingHasRequiredFields(mapping: ColumnMapping): {
  ok: boolean;
  missing: string[];
} {
  const values = new Set(Object.values(mapping).filter(Boolean));
  const missing: string[] = [];
  const hasName = values.has("name") || (values.has("firstName") && values.has("lastName"));
  if (!hasName) missing.push("name (or firstName + lastName)");
  if (!values.has("company")) missing.push("company");
  return { ok: missing.length === 0, missing };
}
