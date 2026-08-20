export const IMPORT_TARGET_FIELDS = [
  "name",
  "firstName",
  "lastName",
  "company",
  "title",
  "email",
  "phone",
  "linkedIn",
  "city",
  "industry",
  "employees",
  "score",
  "tags",
  "rating",
  "owner",
] as const;

export type ImportTargetField = (typeof IMPORT_TARGET_FIELDS)[number];

export type ColumnMapping = Record<string, ImportTargetField | null>;

export type ParsedSheet = {
  headers: string[];
  rows: Record<string, string>[];
  rowCount: number;
};

export type NormalizedImportRow = {
  name: string;
  company: string;
  title?: string;
  email?: string;
  phone?: string;
  linkedIn?: string;
  city?: string;
  industry?: string;
  employees?: string;
  score?: number;
  tags?: string[];
  rating?: string;
  owner?: string;
  rowIndex: number;
};

export type AiColumnMapResult = {
  mappings: ColumnMapping;
  confidence: number;
  notes?: string;
  source: "llm" | "heuristic";
};

export type ImportRowResult = {
  rowIndex: number;
  name: string;
  company: string;
  status: "created" | "skipped" | "failed";
  leadId?: string;
  enriched?: boolean;
  error?: string;
};

export type ImportLeadsSummary = {
  created: number;
  skipped: number;
  failed: number;
  enriched: number;
  results: ImportRowResult[];
  errors: string[];
  warnings: string[];
};

export const MAX_IMPORT_ROWS = 5000;
export const INLINE_ENRICH_MAX = 25;
export const RESEARCH_ENQUEUE_MAX = 50;
export const MULTI_MAP_FIELDS = ["tags"] as const;
