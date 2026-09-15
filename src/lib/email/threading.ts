export type EmailKind =
  | "initial"
  | "followup"
  | "outbound_reply"
  | "inbound_reply"
  | "inbound_auto_reply";

const RE_PREFIX = /^re:\s*/i;

export function generateRfcMessageId(fromAddress: string): string {
  const domain = fromAddress.includes("@") ? fromAddress.split("@")[1] : "ish.local";
  return `<${crypto.randomUUID()}@${domain}>`;
}

/** Strip Re: prefixes and return a canonical root subject. */
export function stripReplyPrefix(subject: string): string {
  let s = subject.trim();
  while (RE_PREFIX.test(s)) {
    s = s.replace(RE_PREFIX, "").trim();
  }
  return s;
}

/** Ensure exactly one Re: prefix for thread continuity. */
export function normalizeReplySubject(rootSubject: string): string {
  const base = stripReplyPrefix(rootSubject);
  return base ? `Re: ${base}` : "Re:";
}

export function buildThreadHeaders(params: {
  inReplyTo?: string | null;
  referencesChain?: string | null;
}): Record<string, string> {
  const headers: Record<string, string> = {};
  if (params.inReplyTo?.trim()) {
    headers["In-Reply-To"] = params.inReplyTo.trim();
  }
  if (params.referencesChain?.trim()) {
    headers["References"] = params.referencesChain.trim();
  }
  return headers;
}

export function parseReferencesChain(chain?: string | null): string[] {
  if (!chain?.trim()) return [];
  return chain.trim().split(/\s+/).filter(Boolean);
}

const ANGLE_MESSAGE_ID_RE = /<[^<>]+>/g;

/** Canonical Message-ID for comparison: no brackets, lowercased. */
export function normalizeRfcMessageId(raw?: string | null): string {
  const trimmed = raw?.trim();
  if (!trimmed) return "";
  return trimmed.replace(/^<|>$/g, "").trim().toLowerCase();
}

function pushMessageIdTokens(raw: string | string[] | null | undefined, into: string[]) {
  if (!raw) return;
  if (Array.isArray(raw)) {
    for (const item of raw) pushMessageIdTokens(item, into);
    return;
  }
  into.push(raw);
}

/**
 * Collect In-Reply-To / References ids from envelopes, mailparser fields, or raw header text.
 */
export function extractReferencedMessageIds(
  inReplyTo?: string | string[] | null,
  references?: string | string[] | null,
): string[] {
  const chunks: string[] = [];
  pushMessageIdTokens(inReplyTo, chunks);
  pushMessageIdTokens(references, chunks);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const chunk of chunks) {
    const angled = chunk.match(ANGLE_MESSAGE_ID_RE);
    const tokens = angled ?? chunk.split(/\s+/);
    for (const token of tokens) {
      const id = normalizeRfcMessageId(token);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function headerValue(headers: Record<string, unknown>, name: string): string | string[] | undefined {
  const keys = [name, name.toLowerCase(), name.toUpperCase()];
  for (const key of keys) {
    const value = headers[key];
    if (typeof value === "string" || Array.isArray(value)) return value;
    if (value && typeof value === "object" && "value" in value) {
      const inner = (value as { value?: unknown }).value;
      if (typeof inner === "string" || Array.isArray(inner)) return inner as string | string[];
    }
  }
  return undefined;
}

export function extractReferencedMessageIdsFromHeaders(
  headers?: Record<string, unknown> | Array<{ name?: string; value?: string }> | null,
): string[] {
  if (!headers) return [];
  if (Array.isArray(headers)) {
    const record: Record<string, string> = {};
    for (const row of headers) {
      const name = row.name?.trim();
      if (!name || !row.value) continue;
      record[name] = record[name] ? `${record[name]} ${row.value}` : row.value;
    }
    return extractReferencedMessageIdsFromHeaders(record);
  }
  return extractReferencedMessageIds(
    headerValue(headers, "In-Reply-To"),
    headerValue(headers, "References"),
  );
}

export function referencedIdsFromInboundPayload(params: {
  inReplyTo?: string | string[] | null;
  references?: string | string[] | null;
  headers?: Record<string, unknown> | Array<{ name?: string; value?: string }> | null;
}): string[] {
  const fromFields = extractReferencedMessageIds(params.inReplyTo, params.references);
  if (fromFields.length) return fromFields;
  return extractReferencedMessageIdsFromHeaders(params.headers);
}

export function appendReference(chain: string | null | undefined, messageId: string): string {
  const id = messageId?.trim();
  if (!id) return chain?.trim() ?? "";
  const ids = parseReferencesChain(chain);
  if (!ids.includes(id)) ids.push(id);
  return ids.join(" ");
}

export function buildReferencesChain(...ids: (string | null | undefined)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const v = id?.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out.join(" ");
}

export function emailKindLabel(kind: EmailKind | string | null | undefined, sequenceDay?: number): string {
  switch (kind) {
    case "initial":
      return "Email 1 sent";
    case "followup":
      return sequenceDay === 7 ? "Email 3 sent" : sequenceDay === 3 ? "Email 2 sent" : `Follow-up (day ${sequenceDay}) sent`;
    case "catalog_on_open":
      return "If Opened sent";
    case "outbound_reply":
      return "Your reply sent";
    case "inbound_reply":
      return "They replied";
    case "inbound_auto_reply":
      return "Auto-reply";
    default:
      if (sequenceDay === 0) return "Email 1 sent";
      if (sequenceDay != null && sequenceDay > 0) return `Follow-up (day ${sequenceDay})`;
      return "Email";
  }
}

export function scheduledLabel(sequenceDay: number): string {
  if (sequenceDay === 3) return "Email 2 scheduled";
  if (sequenceDay === 7) return "Email 3 scheduled";
  return `Follow-up (day ${sequenceDay}) scheduled`;
}
