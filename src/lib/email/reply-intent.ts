import type { ReplyIntentType } from "@/lib/email/outreach-templates";

export type ReplyIntent = ReplyIntentType;

export type AgreedTo = "sample" | "call" | "visit" | null;

export type ReplyIntentResult = {
  intent: ReplyIntent;
  agreedTo: AgreedTo;
};

const AFFIRMATIVE_PATTERNS = [
  /^\s*(sure|yes|yep|yeah|ok|okay|sounds good|go ahead|please send|interested|definitely|absolutely)\s*[!.]*\s*$/i,
  /^\s*(yes|sure|ok|okay)\s*,?\s*(please|thanks|thank you)/i,
  /\b(yes|sure)\s+(please|sounds good|that works|works for me)\b/i,
  /\bplease\s+(send|ship|go ahead)\b/i,
  /\b(go ahead|send it|ship it)\b/i,
  /\binterested\b/i,
  /\bthat works\b/i,
  /\bsounds good\b/i,
];

const NEGATIVE_PATTERNS = [
  /\bnot interested\b/i,
  /\bno thanks\b/i,
  /\bno thank you\b/i,
  /\bunsubscribe\b/i,
  /\bremove me\b/i,
  /\bstop emailing\b/i,
  /\bdo not contact\b/i,
  /\bdon'?t contact\b/i,
  /\bnot at this time\b/i,
  /\bnot right now\b/i,
  /^\s*no\s*[!.]*\s*$/i,
];

const SCHEDULING_PATTERNS = [
  /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
  /\b\d{1,2}(:\d{2})?\s*(am|pm)\b/i,
  /\b(next week|this week|tomorrow|today)\b/i,
  /\b(calendar|schedule|slot|availability|available)\b/i,
  /\b\d{1,2}\/\d{1,2}\b/,
];

const QUESTION_STARTERS = /^\s*(what|how|when|where|why|who|which|can you|could you|do you|is there|are there)\b/i;

export function classifyReplyIntent(text: string, priorCta?: string | null): ReplyIntentResult {
  const trimmed = text.trim();
  if (!trimmed) return { intent: "other", agreedTo: null };

  if (NEGATIVE_PATTERNS.some((p) => p.test(trimmed))) {
    return { intent: "negative", agreedTo: null };
  }

  if (trimmed.includes("?") || QUESTION_STARTERS.test(trimmed)) {
    return { intent: "question", agreedTo: null };
  }

  if (SCHEDULING_PATTERNS.some((p) => p.test(trimmed)) && !AFFIRMATIVE_PATTERNS.some((p) => p.test(trimmed))) {
    return { intent: "scheduling", agreedTo: inferAgreedTo(priorCta) };
  }

  if (AFFIRMATIVE_PATTERNS.some((p) => p.test(trimmed))) {
    return { intent: "affirmative", agreedTo: inferAgreedTo(priorCta) };
  }

  if (trimmed.split(/\s+/).length <= 3 && !NEGATIVE_PATTERNS.some((p) => p.test(trimmed))) {
    const lower = trimmed.toLowerCase().replace(/[!.]/g, "");
    if (["sure", "yes", "ok", "okay", "yep", "yeah"].includes(lower)) {
      return { intent: "affirmative", agreedTo: inferAgreedTo(priorCta) };
    }
  }

  return { intent: "other", agreedTo: null };
}

function inferAgreedTo(priorCta?: string | null): AgreedTo {
  if (!priorCta) return null;
  const lower = priorCta.toLowerCase();
  if (/sample|tasting|hamper|box|send.*gift/i.test(lower)) return "sample";
  if (/call|online|presentation|video|meet online/i.test(lower)) return "call";
  if (/visit|in.?person|office/i.test(lower)) return "visit";
  return null;
}

/** Extract the last question sentence from an email body (likely the prior CTA). */
export function extractPriorCta(emailBody: string): string | null {
  const sentences = emailBody
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (let i = sentences.length - 1; i >= 0; i--) {
    if (sentences[i].includes("?")) return sentences[i];
  }
  return null;
}
