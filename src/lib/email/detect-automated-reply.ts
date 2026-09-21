export type AutomatedReplyDetection = {
  automated: boolean;
  reason?: string;
};

type HeaderBag =
  | Record<string, string | string[] | undefined>
  | Array<{ name?: string; value?: string } | null | undefined>
  | null
  | undefined;

function headerMap(headers: HeaderBag): Map<string, string> {
  const out = new Map<string, string>();
  if (!headers) return out;
  if (Array.isArray(headers)) {
    for (const row of headers) {
      const name = row?.name?.trim().toLowerCase();
      const value = typeof row?.value === "string" ? row.value.trim() : "";
      if (!name || !value) continue;
      out.set(name, value);
    }
    return out;
  }
  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = rawName.trim().toLowerCase();
    if (!name) continue;
    const value = Array.isArray(rawValue)
      ? rawValue.filter((v) => typeof v === "string").join(" ").trim()
      : typeof rawValue === "string"
        ? rawValue.trim()
        : "";
    if (!value) continue;
    out.set(name, value);
  }
  return out;
}

function headerIncludes(value: string | undefined, needle: string): boolean {
  return Boolean(value && value.toLowerCase().includes(needle));
}

const SUBJECT_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\bout\s+of\s+(the\s+)?office\b/i, reason: "ooo_subject" },
  { re: /\bautomatic\s+reply\b/i, reason: "auto_reply_subject" },
  { re: /\bauto[\s-]?reply\b/i, reason: "auto_reply_subject" },
  { re: /\bauto[\s-]?response\b/i, reason: "auto_reply_subject" },
  { re: /\baway\s+from\s+(the\s+)?(office|desk|keyboard|work)\b/i, reason: "ooo_subject" },
  { re: /\bvacation\s+(reply|response|message)\b/i, reason: "vacation_subject" },
  { re: /\b(maternity|paternity|parental|medical|sick|annual|sabbatical)\s+leave\b/i, reason: "leave_subject" },
  { re: /\bleave\s+of\s+absence\b/i, reason: "leave_subject" },
  { re: /\bon\s+(extended\s+)?leave\b/i, reason: "leave_subject" },
  { re: /\bdelivery\s+status\s+notification\b/i, reason: "dsn_subject" },
  { re: /\bundeliver(?:ed|able)\b/i, reason: "dsn_subject" },
  { re: /\bmail\s+delivery\s+failed\b/i, reason: "dsn_subject" },
  { re: /\breturned\s+to\s+sender\b/i, reason: "dsn_subject" },
  { re: /\bfailure\s+notice\b/i, reason: "dsn_subject" },
  { re: /\bread\s*:\s*/i, reason: "read_receipt_subject" },
];

const BODY_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\bthis\s+is\s+an?\s+automated?\s+(reply|response|message)\b/i, reason: "auto_body" },
  { re: /\bautomatic\s+reply\b/i, reason: "auto_body" },
  { re: /\bauto[\s-]?generated\b/i, reason: "auto_body" },
  { re: /\bcreated\s+automatically\s+by\s+mail\s+delivery\s+software\b/i, reason: "dsn_body" },
  { re: /\bcould\s+not\s+be\s+delivered\b/i, reason: "dsn_body" },
  { re: /\bundeliver(?:ed|able)\b/i, reason: "dsn_body" },
  { re: /\bout\s+of\s+(the\s+)?office\b/i, reason: "ooo_body" },
  { re: /\bI\s+am\s+currently\s+out\s+of\s+(the\s+)?office\b/i, reason: "ooo_body" },
  { re: /\bwill\s+be\s+out\s+of\s+(the\s+)?office\b/i, reason: "ooo_body" },
  { re: /\bcurrently\s+(away|unavailable)\b/i, reason: "ooo_body" },
  { re: /\baway\s+from\s+(work|the\s+office)\b/i, reason: "ooo_body" },
  { re: /\bon\s+vacation\b/i, reason: "vacation_body" },
  { re: /\b(maternity|paternity|parental|medical|sick|annual|sabbatical)\s+leave\b/i, reason: "leave_body" },
  { re: /\bleave\s+of\s+absence\b/i, reason: "leave_body" },
  { re: /\bI\s+am\s+currently\s+on\s+(extended\s+)?leave\b/i, reason: "leave_body" },
  { re: /\bcurrently\s+on\s+(maternity|paternity|parental|medical|sick|annual|sabbatical)\s+leave\b/i, reason: "leave_body" },
  { re: /\bno\s+longer\s+with\s+(the\s+)?(company|organization|firm)\b/i, reason: "left_company_body" },
];

/**
 * Classify inbound mail as automated (OOO / auto-reply / DSN) vs likely human.
 * Prefer headers; fall back to subject/body phrases.
 */
export function detectAutomatedReply(params: {
  subject?: string | null;
  text?: string | null;
  headers?: HeaderBag;
}): AutomatedReplyDetection {
  const headers = headerMap(params.headers);

  const autoSubmitted = headers.get("auto-submitted");
  if (autoSubmitted && !/^no$/i.test(autoSubmitted.trim())) {
    return { automated: true, reason: "header_auto_submitted" };
  }

  const xAutoreply = headers.get("x-autoreply") ?? headers.get("x-auto-reply");
  if (xAutoreply && !/^(no|false|0)$/i.test(xAutoreply.trim())) {
    return { automated: true, reason: "header_x_autoreply" };
  }

  const precedence = headers.get("precedence");
  if (precedence && /\b(auto_reply|bulk|junk)\b/i.test(precedence)) {
    return { automated: true, reason: "header_precedence" };
  }

  if (headers.get("x-auto-response-suppress")) {
    return { automated: true, reason: "header_auto_response_suppress" };
  }

  const subject = (params.subject ?? "").trim();
  for (const rule of SUBJECT_PATTERNS) {
    if (rule.re.test(subject)) return { automated: true, reason: rule.reason };
  }

  const text = (params.text ?? "").slice(0, 4000);
  for (const rule of BODY_PATTERNS) {
    if (rule.re.test(text)) return { automated: true, reason: rule.reason };
  }

  if (headerIncludes(headers.get("x-postfix-autoreply"), "yes")) {
    return { automated: true, reason: "header_postfix_autoreply" };
  }

  return { automated: false };
}
