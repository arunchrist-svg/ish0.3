function stripCodeFences(raw: string): string {
  return raw
    .replace(/^```(?:json|JSON)?\s*\n?/m, "")
    .replace(/\n?```\s*$/m, "")
    .trim();
}

function fixTrailingCommas(json: string): string {
  return json.replace(/,\s*([}\]])/g, "$1");
}

function extractBalancedJson(text: string, open: "[" | "{"): string | null {
  const close = open === "[" ? "]" : "}";
  const start = text.indexOf(open);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

function normalizeToArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["companies", "results", "data", "items", "people"]) {
      const nested = record[key];
      if (Array.isArray(nested)) {
        return nested.filter((item) => item && typeof item === "object") as Record<string, unknown>[];
      }
    }
  }

  throw new Error("LLM response is not a JSON array");
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return JSON.parse(fixTrailingCommas(text));
  }
}

/** Best-effort parse of JSON arrays from LLM text (markdown fences, prose, wrappers). */
export function parseJsonArrayFromLLM(raw: string): Record<string, unknown>[] {
  const cleaned = stripCodeFences(raw.trim());
  if (!cleaned) throw new Error("Empty LLM response");

  const attempts = [
    cleaned,
    extractBalancedJson(cleaned, "[") ?? "",
    extractBalancedJson(cleaned, "{") ?? "",
  ].filter(Boolean);

  let lastError: unknown;
  for (const candidate of attempts) {
    try {
      return normalizeToArray(tryParseJson(candidate));
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Could not parse JSON from LLM response");
}

/** Best-effort parse of a JSON object from LLM text. */
export function parseJsonObjectFromLLM(raw: string): Record<string, unknown> {
  const cleaned = stripCodeFences(raw.trim());
  if (!cleaned) throw new Error("Empty LLM response");

  const attempts = [
    cleaned,
    extractBalancedJson(cleaned, "{") ?? "",
    extractBalancedJson(cleaned, "[") ?? "",
  ].filter(Boolean);

  let lastError: unknown;
  for (const candidate of attempts) {
    try {
      const parsed = tryParseJson(candidate);
      if (Array.isArray(parsed)) {
        const first = parsed.find((item) => item && typeof item === "object");
        if (first && typeof first === "object") return first as Record<string, unknown>;
      } else if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Could not parse JSON object from LLM response");
}
