import { z } from "zod";
import { parseJsonObjectFromLLM } from "@/lib/llm/parse-json";

export const writerOutputSchema = z.object({
  subjectA: z.string().min(1).optional(),
  subjectB: z.string().min(1).optional(),
  subjectC: z.string().min(1).optional(),
  emailBody: z.string().min(1).optional(),
  emailBodyB: z.string().min(1).optional(),
  emailBodyC: z.string().min(1).optional(),
  outreachGoal: z.string().min(1).optional(),
  templateVariant: z.string().optional(),
  changeSummary: z.string().optional(),
});

export type WriterOutput = z.infer<typeof writerOutputSchema>;

export function looksLikeLlmJsonDump(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/^```(?:json)?/i.test(t)) return true;
  if (/^\{\s*"?(subjectA|subjectB|subjectC|emailBody|emailBodyB|emailBodyC|outreachGoal)"?\s*:/i.test(t)) return true;
  if (/"subjectA"\s*:/.test(t) && /"emailBody"\s*:/.test(t)) return true;
  return false;
}

export function isUsableEmailBody(body: string | undefined | null): boolean {
  const t = (body ?? "").trim();
  if (t.length < 40) return false;
  if (looksLikeLlmJsonDump(t)) return false;
  return true;
}

function unescapeJsonFragment(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function extractQuotedJsonField(raw: string, field: string): string | undefined {
  const re = new RegExp(`"${field}"\\s*:\\s*"`, "i");
  const match = re.exec(raw);
  if (!match) return undefined;

  let out = "";
  let escaped = false;
  for (let i = match.index + match[0].length; i < raw.length; i++) {
    const ch = raw[i];
    if (escaped) {
      if (ch === "n") out += "\n";
      else if (ch === "t") out += "\t";
      else if (ch === '"') out += '"';
      else if (ch === "\\") out += "\\";
      else out += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') return out;
    out += ch;
  }

  const trimmed = unescapeJsonFragment(out).trim();
  if (trimmed.length >= 40) return trimmed;
  return undefined;
}

function extractWriterFieldsFromRaw(raw: string): WriterOutput {
  return {
    subjectA: extractQuotedJsonField(raw, "subjectA"),
    subjectB: extractQuotedJsonField(raw, "subjectB"),
    subjectC: extractQuotedJsonField(raw, "subjectC"),
    emailBody: extractQuotedJsonField(raw, "emailBody"),
    emailBodyB: extractQuotedJsonField(raw, "emailBodyB"),
    emailBodyC: extractQuotedJsonField(raw, "emailBodyC"),
    outreachGoal: extractQuotedJsonField(raw, "outreachGoal"),
    changeSummary: extractQuotedJsonField(raw, "changeSummary"),
  };
}

export function parseWriterOutput(raw: string): { data: WriterOutput; valid: boolean } {
  try {
    const obj = parseJsonObjectFromLLM(raw);
    const parsed = writerOutputSchema.safeParse(obj);
    if (parsed.success && isUsableEmailBody(parsed.data.emailBody)) {
      return { data: parsed.data, valid: true };
    }
    const partial = writerOutputSchema.partial().parse(obj);
    if (partial.emailBody && looksLikeLlmJsonDump(partial.emailBody)) {
      delete partial.emailBody;
    }
    const recovered = extractWriterFieldsFromRaw(raw);
    const merged = {
      ...partial,
      subjectA: partial.subjectA || recovered.subjectA,
      subjectB: partial.subjectB || recovered.subjectB,
      subjectC: partial.subjectC || recovered.subjectC,
      emailBody: isUsableEmailBody(partial.emailBody) ? partial.emailBody : recovered.emailBody,
      emailBodyB: isUsableEmailBody(partial.emailBodyB) ? partial.emailBodyB : recovered.emailBodyB,
      emailBodyC: isUsableEmailBody(partial.emailBodyC) ? partial.emailBodyC : recovered.emailBodyC,
      outreachGoal: partial.outreachGoal || recovered.outreachGoal,
      changeSummary: partial.changeSummary || recovered.changeSummary,
    };
    return { data: merged, valid: isUsableEmailBody(merged.emailBody) };
  } catch {
    const recovered = extractWriterFieldsFromRaw(raw);
    return { data: recovered, valid: isUsableEmailBody(recovered.emailBody) };
  }
}
