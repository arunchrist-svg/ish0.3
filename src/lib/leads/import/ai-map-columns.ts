import { callLLM } from "@/lib/llm";
import { parseJsonObjectFromLLM } from "@/lib/llm/parse-json";
import {
  IMPORT_TARGET_FIELDS,
  MULTI_MAP_FIELDS,
  type AiColumnMapResult,
  type ColumnMapping,
  type ImportTargetField,
} from "./types";

const SYNONYMS: Record<ImportTargetField, string[]> = {
  name: [
    "person name",
    "contact name",
    "lead name",
    "full name",
    "fullname",
    "contact person",
    "person",
    "contact",
    "name",
  ],
  firstName: ["first name", "firstname", "given name", "fname"],
  lastName: ["last name", "lastname", "surname", "family name", "lname"],
  company: [
    "company name",
    "account name",
    "organisation",
    "organization",
    "employer",
    "business",
    "company",
    "account",
    "firm",
    "org",
  ],
  title: ["job title", "designation", "position", "title", "role", "job"],
  email: ["email address", "work email", "business email", "e mail", "email", "mail"],
  phone: ["phone number", "contact number", "telephone", "mobile", "phone", "cell", "tel"],
  linkedIn: ["linkedin url", "linkedin profile", "linkedin", "li url", "profile url"],
  city: ["hq city", "office city", "city", "location", "town"],
  industry: ["industry", "sector", "vertical"],
  employees: ["employee count", "company size", "headcount", "employees", "staff"],
  score: ["lead score", "fit score", "priority", "score"],
  tags: ["source sheet", "source file", "source", "labels", "label", "tags", "tag", "list"],
  rating: ["hot warm cold", "temperature", "rating"],
  owner: ["lead owner", "assigned to", "salesperson", "owner", "rep"],
};

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[_/\\|]+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isTargetField(value: unknown): value is ImportTargetField {
  return typeof value === "string" && (IMPORT_TARGET_FIELDS as readonly string[]).includes(value);
}

function allowsMultiple(field: ImportTargetField): boolean {
  return (MULTI_MAP_FIELDS as readonly string[]).includes(field);
}

function hasWholePhrase(haystack: string, needle: string): boolean {
  if (!needle) return false;
  if (haystack === needle) return true;
  const pattern = new RegExp(`(?:^| )${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: |$)`);
  return pattern.test(haystack);
}

function matchScore(headerNorm: string, synonym: string): number {
  if (!headerNorm || !synonym) return 0;
  if (headerNorm === synonym) return 200 + synonym.length;
  if (hasWholePhrase(headerNorm, synonym)) return 120 + synonym.length * 2;
  if (hasWholePhrase(synonym, headerNorm) && headerNorm.length >= 4) return 40 + headerNorm.length;
  return 0;
}

function bestFieldForHeader(
  headerNorm: string,
  used: Set<ImportTargetField>,
): { field: ImportTargetField; score: number } | null {
  let best: { field: ImportTargetField; score: number } | null = null;

  for (const field of IMPORT_TARGET_FIELDS) {
    if (used.has(field) && !allowsMultiple(field)) continue;
    let fieldScore = 0;
    for (const synonym of SYNONYMS[field]) {
      fieldScore = Math.max(fieldScore, matchScore(headerNorm, synonym));
    }
    if (fieldScore <= 0) continue;
    if (!best || fieldScore > best.score) {
      best = { field, score: fieldScore };
    }
  }

  return best;
}

export function heuristicMapColumns(headers: string[]): AiColumnMapResult {
  const mappings: ColumnMapping = {};
  const used = new Set<ImportTargetField>();
  const scored = headers.map((header) => {
    const norm = normalizeHeader(header);
    const match = bestFieldForHeader(norm, new Set());
    return { header, norm, field: match?.field ?? null, score: match?.score ?? 0 };
  });

  scored.sort((a, b) => b.score - a.score);

  for (const item of scored) {
    if (!item.field || item.score <= 0) {
      mappings[item.header] = mappings[item.header] ?? null;
      continue;
    }
    if (used.has(item.field) && !allowsMultiple(item.field)) {
      mappings[item.header] = null;
      continue;
    }

    // Re-score against remaining fields in case the global best was taken
    const match = bestFieldForHeader(item.norm, used);
    if (!match) {
      mappings[item.header] = null;
      continue;
    }
    mappings[item.header] = match.field;
    used.add(match.field);
  }

  for (const header of headers) {
    if (!(header in mappings)) mappings[header] = null;
  }

  const values = Object.values(mappings);
  const hasName =
    values.includes("name") || (values.includes("firstName") && values.includes("lastName"));
  const hasCompany = values.includes("company");
  const confidence = hasCompany ? (hasName ? 0.86 : 0.72) : hasName ? 0.45 : 0.2;

  return {
    mappings,
    confidence,
    notes: "Mapped with header synonyms",
    source: "heuristic",
  };
}

function sanitizeMappings(headers: string[], raw: Record<string, unknown>): ColumnMapping {
  const mappings: ColumnMapping = {};
  const used = new Set<ImportTargetField>();

  for (const header of headers) {
    const candidate = raw[header];
    if (isTargetField(candidate) && (!used.has(candidate) || allowsMultiple(candidate))) {
      mappings[header] = candidate;
      used.add(candidate);
    } else {
      mappings[header] = null;
    }
  }

  return mappings;
}

function correctObviousMappings(headers: string[], mappings: ColumnMapping): ColumnMapping {
  const used = () => new Set(Object.values(mappings).filter(Boolean) as ImportTargetField[]);

  for (const header of headers) {
    const norm = normalizeHeader(header);
    if (norm === "company name" && mappings[header] !== "company" && !used().has("company")) {
      mappings[header] = "company";
    }
    if (
      (norm === "person name" || norm === "contact name" || norm === "contact person") &&
      mappings[header] !== "name" &&
      !used().has("name")
    ) {
      mappings[header] = "name";
    }
  }
  return mappings;
}

export async function aiMapColumns(params: {
  headers: string[];
  sampleRows: Record<string, string>[];
  tenantId: string;
  workspaceId?: string;
}): Promise<AiColumnMapResult> {
  const fallback = heuristicMapColumns(params.headers);

  try {
    const sample = params.sampleRows.slice(0, 5);
    const text = await callLLM({
      tier: "fast",
      maxTokens: 1024,
      system: `You map spreadsheet column headers to CRM lead fields.
Return ONLY valid JSON:
{"mappings":{"ExactHeader":"targetField"|null,...},"confidence":0.0-1.0,"notes":"brief"}
Allowed targetField values: ${IMPORT_TARGET_FIELDS.join(", ")}
Rules:
- Map each header to at most one targetField. Unused headers must be null.
- Prefer "name" for person/contact columns. Never map Company Name to name.
- Prefer "company" for organisation/account columns. Company-only sheets are valid.
- Map source file, source sheet, or list columns to tags.
- tags may be used more than once. Other targetFields must be unique.
- Do not invent headers. Use exact header strings from the input.`,
      prompt: JSON.stringify({
        headers: params.headers,
        sampleRows: sample,
      }),
      trace: {
        agent: "lead-import-mapper",
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        promptVersion: "lead-import-map-v2",
      },
    });

    const parsed = parseJsonObjectFromLLM(text) as {
      mappings?: Record<string, unknown>;
      confidence?: unknown;
      notes?: unknown;
    };

    if (!parsed?.mappings || typeof parsed.mappings !== "object") {
      return fallback;
    }

    const mappings = correctObviousMappings(
      params.headers,
      sanitizeMappings(params.headers, parsed.mappings),
    );
    const heuristic = heuristicMapColumns(params.headers);
    for (const header of params.headers) {
      if (mappings[header] == null && heuristic.mappings[header]) {
        const field = heuristic.mappings[header]!;
        const alreadyUsed = Object.values(mappings).includes(field);
        if (!alreadyUsed || allowsMultiple(field)) mappings[header] = field;
      }
    }

    const confidence =
      typeof parsed.confidence === "number" && parsed.confidence >= 0 && parsed.confidence <= 1
        ? parsed.confidence
        : fallback.confidence;

    return {
      mappings,
      confidence,
      notes: typeof parsed.notes === "string" ? parsed.notes : undefined,
      source: "llm",
    };
  } catch (error) {
    console.warn(
      "[lead-import] AI column map failed, using heuristics:",
      error instanceof Error ? error.message : error,
    );
    return fallback;
  }
}
