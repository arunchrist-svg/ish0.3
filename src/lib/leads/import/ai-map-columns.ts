import { callLLM } from "@/lib/llm";
import { parseJsonObjectFromLLM } from "@/lib/llm/parse-json";
import {
  IMPORT_TARGET_FIELDS,
  type AiColumnMapResult,
  type ColumnMapping,
  type ImportTargetField,
} from "./types";

const SYNONYMS: Record<ImportTargetField, string[]> = {
  name: ["name", "full name", "fullname", "contact name", "lead name", "person", "contact"],
  firstName: ["first name", "firstname", "first", "given name", "fname"],
  lastName: ["last name", "lastname", "last", "surname", "family name", "lname"],
  company: [
    "company",
    "company name",
    "organisation",
    "organization",
    "org",
    "account",
    "account name",
    "employer",
    "business",
    "firm",
  ],
  title: ["title", "job title", "position", "role", "designation", "job"],
  email: ["email", "email address", "e-mail", "mail", "work email", "business email"],
  phone: ["phone", "phone number", "mobile", "cell", "telephone", "tel", "contact number"],
  linkedIn: ["linkedin", "linkedin url", "linkedin profile", "li url", "profile url"],
  city: ["city", "location", "town", "hq city", "office city"],
  industry: ["industry", "sector", "vertical"],
  employees: ["employees", "employee count", "headcount", "company size", "size", "staff"],
  score: ["score", "lead score", "fit score", "priority"],
  tags: ["tags", "label", "labels", "tag"],
  rating: ["rating", "hot/warm/cold", "temperature"],
  owner: ["owner", "lead owner", "assigned to", "salesperson", "rep"],
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

export function heuristicMapColumns(headers: string[]): AiColumnMapResult {
  const mappings: ColumnMapping = {};
  const used = new Set<ImportTargetField>();

  for (const header of headers) {
    const norm = normalizeHeader(header);
    let matched: ImportTargetField | null = null;

    for (const field of IMPORT_TARGET_FIELDS) {
      if (used.has(field)) continue;
      const synonyms = SYNONYMS[field];
      if (synonyms.some((s) => s === norm || norm.includes(s) || s.includes(norm))) {
        matched = field;
        break;
      }
    }

    // Prefer exact full-name over first/last when header is just "name"
    if (matched === "firstName" && (norm === "name" || norm === "full name")) {
      matched = "name";
    }

    if (matched) used.add(matched);
    mappings[header] = matched;
  }

  const hasName =
    Object.values(mappings).includes("name") ||
    (Object.values(mappings).includes("firstName") && Object.values(mappings).includes("lastName"));
  const hasCompany = Object.values(mappings).includes("company");
  const confidence = hasName && hasCompany ? 0.75 : hasName || hasCompany ? 0.45 : 0.2;

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
    if (isTargetField(candidate) && !used.has(candidate)) {
      mappings[header] = candidate;
      used.add(candidate);
    } else {
      mappings[header] = null;
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
- Prefer "name" for full name columns. Use firstName/lastName only when split.
- Prefer "company" for organisation/account columns.
- Do not invent headers. Use exact header strings from the input.`,
      prompt: JSON.stringify({
        headers: params.headers,
        sampleRows: sample,
      }),
      trace: {
        agent: "lead-import-mapper",
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        promptVersion: "lead-import-map-v1",
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

    const mappings = sanitizeMappings(params.headers, parsed.mappings);
    // Fill gaps with heuristic for unmapped required-ish fields
    const heuristic = heuristicMapColumns(params.headers);
    for (const header of params.headers) {
      if (mappings[header] == null && heuristic.mappings[header]) {
        const field = heuristic.mappings[header]!;
        const alreadyUsed = Object.values(mappings).includes(field);
        if (!alreadyUsed) mappings[header] = field;
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
