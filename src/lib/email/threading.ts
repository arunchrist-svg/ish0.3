export type EmailKind = "initial" | "followup" | "outbound_reply" | "inbound_reply";

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
    case "outbound_reply":
      return "Your reply sent";
    case "inbound_reply":
      return "They replied";
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
