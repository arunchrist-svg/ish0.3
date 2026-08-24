import { pickBestEmail, extractEmailsFromCell } from "@/lib/enrichment/validate-contact";
import type { ColumnMapping, NormalizedImportRow } from "./types";

const GENERIC_EMAIL_LOCALS = new Set([
  "info",
  "hr",
  "admin",
  "contact",
  "office",
  "sales",
  "hello",
  "support",
  "team",
  "help",
  "enquiry",
  "enquiries",
  "mail",
  "noreply",
  "no reply",
]);

function cells(row: Record<string, string>, mapping: ColumnMapping, field: string): string[] {
  const values: string[] = [];
  const seen = new Set<string>();

  for (const header of Object.keys(row)) {
    seen.add(header);
    if (mapping[header] !== field) continue;
    const value = (row[header] ?? "").trim();
    if (value) values.push(value);
  }

  for (const [header, target] of Object.entries(mapping)) {
    if (seen.has(header) || target !== field) continue;
    const value = (row[header] ?? "").trim();
    if (value) values.push(value);
  }

  return values;
}

function cell(row: Record<string, string>, mapping: ColumnMapping, field: string): string {
  return cells(row, mapping, field)[0] ?? "";
}

function parseScore(raw: string): number | undefined {
  if (!raw) return undefined;
  const n = Number(String(raw).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function parseTags(rawValues: string[]): string[] | undefined {
  const tags = rawValues
    .flatMap((raw) => raw.split(/[,;|]/))
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !/^sheet\s*\d+$/i.test(t));
  const unique = Array.from(new Set(tags));
  return unique.length ? unique : undefined;
}

export function nameFromEmailLocal(email: string): string {
  const local = email.split("@")[0] ?? "";
  const cleaned = local
    .replace(/\+.*/, "")
    .replace(/[._\-]+/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || GENERIC_EMAIL_LOCALS.has(cleaned.toLowerCase())) return "";
  return cleaned
    .split(" ")
    .filter((part) => part.length >= 2)
    .map((part) => part[0]!.toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export function applyColumnMapping(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
): {
  rows: NormalizedImportRow[];
  invalid: { rowIndex: number; reason: string }[];
  skipped: { rowIndex: number; reason: string }[];
} {
  const result: NormalizedImportRow[] = [];
  const invalid: { rowIndex: number; reason: string }[] = [];
  const skipped: { rowIndex: number; reason: string }[] = [];

  rows.forEach((row, index) => {
    const rowIndex = index + 2; // 1-based sheet row including header
    const firstName = cell(row, mapping, "firstName");
    const lastName = cell(row, mapping, "lastName");
    const fullName = cell(row, mapping, "name");
    const company = cell(row, mapping, "company");
    const emailRaw = cell(row, mapping, "email");
    const extractedEmails = extractEmailsFromCell(emailRaw);
    const email = pickBestEmail(extractedEmails) ?? extractedEmails[0] ?? "";
    const named =
      fullName ||
      [firstName, lastName].filter(Boolean).join(" ") ||
      nameFromEmailLocal(email);
    const name = (named || company).trim();

    if (!company) {
      invalid.push({
        rowIndex,
        reason: "Missing company",
      });
      return;
    }

    if (!email) {
      skipped.push({
        rowIndex,
        reason: emailRaw ? "Invalid email" : "Missing email",
      });
      return;
    }

    const scoreRaw = cell(row, mapping, "score");
    const tagsRaw = cells(row, mapping, "tags");

    result.push({
      rowIndex,
      name,
      company,
      title: cell(row, mapping, "title") || undefined,
      email: email || undefined,
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

  return { rows: result, invalid, skipped };
}

export function mappingHasRequiredFields(mapping: ColumnMapping): {
  ok: boolean;
  missing: string[];
} {
  const values = new Set(Object.values(mapping).filter(Boolean));
  const missing: string[] = [];
  if (!values.has("company")) missing.push("company");
  if (!values.has("email")) missing.push("email");
  return { ok: missing.length === 0, missing };
}
