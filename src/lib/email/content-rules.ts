import rulesConfig from "@/lib/email/content-rules.config.json";
import type { EmailStyle } from "@/lib/email/config";

export type ContentRuleSeverity = "info" | "warn" | "critical";

export type ContentRuleHit = {
  id: string;
  label: string;
  delta: number;
  severity: ContentRuleSeverity;
};

export type ContentRuleContext = {
  sequencePosition?: number;
  account?: {
    name?: string | null;
    employees?: string | null;
    industry?: string | null;
    city?: string | null;
    enrichmentSource?: string | null;
  };
  contact?: {
    firstName?: string | null;
    title?: string | null;
  };
  fromName?: string;
  emailStyle?: EmailStyle;
  giftingHook?: string | null;
  recentSubjects?: string[];
};

const INFO_ASK = rulesConfig.infoAskPhrases.map((p) => p.toLowerCase());
const SOFT_EXIT = rulesConfig.softExitPhrases.map((p) => p.toLowerCase());
const COMMERCIAL = rulesConfig.commercialSignals.map((p) => p.toLowerCase());

function normalizeSkeleton(subject: string, companyName?: string | null): string {
  let s = subject.trim().toLowerCase();
  if (companyName) {
    const co = companyName.trim().toLowerCase();
    if (co) s = s.replaceAll(co, "{co}");
  }
  return s.replace(/\s+/g, " ");
}

function firstParagraph(body: string): string {
  const parts = body.trim().split(/\n\n+/);
  return (parts[0] ?? body).trim();
}

/** Greeting + first substantive paragraph — not just "Hi {name}," on its own line. */
function openingSection(body: string): string {
  const parts = body.trim().split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? body.trim();
  return parts.slice(0, 2).join("\n\n");
}

function signOffBlock(body: string): string {
  const parts = body.trim().split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  return parts.length > 1 ? (parts[parts.length - 1] ?? "") : "";
}

function hasPersonalizationBeyondNameCompany(
  body: string,
  contactFirstName?: string | null,
  account?: ContentRuleContext["account"],
  giftingHook?: string | null,
  contact?: ContentRuleContext["contact"],
): boolean {
  const opener = openingSection(body).toLowerCase();
  const signals = [
    account?.industry,
    account?.city,
    contact?.title,
    giftingHook,
  ]
    .filter(Boolean)
    .map((s) => String(s).toLowerCase());

  for (const signal of signals) {
    if (signal && opener.includes(signal)) return true;
  }

  const name = contactFirstName?.trim().toLowerCase();
  const company = account?.name?.trim().toLowerCase();
  let stripped = opener;
  if (name) stripped = stripped.replace(new RegExp(`\\bhi\\s+${name}\\b`, "i"), "");
  if (company) stripped = stripped.replace(new RegExp(company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "");
  stripped = stripped.replace(/[,\.\s]/g, "");
  return stripped.length > 20;
}

export function applyContentRules(
  body: string,
  subject: string,
  ctx: ContentRuleContext = {},
): ContentRuleHit[] {
  const hits: ContentRuleHit[] = [];
  const lowerBody = body.toLowerCase();
  const sequencePosition = ctx.sequencePosition ?? 1;
  const account = ctx.account;
  const contact = ctx.contact;

  if (sequencePosition === 1) {
    const matched = INFO_ASK.find((phrase) => lowerBody.includes(phrase));
    if (matched) {
      hits.push({
        id: "A",
        label: "Asking for personal/business info before any reply is a known spam trigger",
        delta: -18,
        severity: "critical",
      });
    }
  }

  const statMatch =
    lowerBody.match(/\b(\d{1,6}[\s,-]*)(person|people|employee|employees|headcount|team)\b/) ||
    lowerBody.match(/\b(\d{1,6})-person\b/) ||
    lowerBody.match(/\b(\d{1,6})\+?\s*(employees|employee)\b/);
  const citedEmployeeStat =
    account?.employees?.trim() &&
    account.employees !== "100+" &&
    lowerBody.includes(account.employees.replace(/,/g, "").slice(0, 4));
  if (statMatch || citedEmployeeStat) {
    hits.push({
      id: "B",
      label: "Do not cite employee counts or numeric company stats; say your team instead",
      delta: -15,
      severity: "warn",
    });
  }

  const firstName = contact?.firstName?.trim();
  if (firstName) {
    const opener = openingSection(body);
    const templated =
      opener.toLowerCase().startsWith(`hi ${firstName.toLowerCase()}`) &&
      !hasPersonalizationBeyondNameCompany(opener, firstName, account, ctx.giftingHook, contact);
    if (templated) {
      hits.push({
        id: "C",
        label: "Generic opener — only name and company before the pitch; add a specific, sourced detail",
        delta: -15,
        severity: "warn",
      });
    }
  }

  const questionIdx = body.indexOf("?");
  const hasSoftExit = SOFT_EXIT.some((p) => lowerBody.includes(p));
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  if (questionIdx >= 0 && wordCount > 30 && !hasSoftExit) {
    const beforeQuestion = body.slice(0, questionIdx);
    const pitchWords = beforeQuestion.trim().split(/\s+/).filter(Boolean).length;
    const highPitchRatio = pitchWords / wordCount > 0.55;
    if (sequencePosition === 1 || highPitchRatio) {
      hits.push({
        id: "D",
        label: "Pitch goes straight to CTA with no soft-exit (e.g. \"no worries if not relevant\")",
        delta: -12,
        severity: "warn",
      });
    }
  }

  const isCommercial = COMMERCIAL.some((p) => lowerBody.includes(p));
  const hasUnsubscribe =
    lowerBody.includes("unsubscribe") || lowerBody.includes("you received this email because");
  const emailStyle = ctx.emailStyle ?? "primary";
  if (sequencePosition === 1 && isCommercial && emailStyle === "marketing" && !hasUnsubscribe) {
    hits.push({
      id: "E",
      label: "Commercial email missing unsubscribe/compliance footer",
      delta: -12,
      severity: "warn",
    });
  }

  const recent = ctx.recentSubjects ?? [];
  if (recent.length >= 2 && account?.name) {
    const skeleton = normalizeSkeleton(subject, account.name);
    const matches = recent.filter((s) => normalizeSkeleton(s, account.name) === skeleton);
    if (matches.length >= 2) {
      hits.push({
        id: "F",
        label: "Subject line template detected — vary structure per batch, not just company name",
        delta: -10,
        severity: "warn",
      });
    }
  }

  const signOff = signOffBlock(body);
  const fromFirst = ctx.fromName?.split(" ")[0]?.trim();
  if (fromFirst && signOff.toLowerCase().includes(fromFirst.toLowerCase())) {
    const hasRoleOrContact =
      /\b(manager|director|head|founder|ceo|vp|lead|partnerships|sales|account)\b/i.test(signOff) ||
      /linkedin|phone|\+91|\(\d{3}\)|\b\d{10}\b/i.test(signOff);
    if (!hasRoleOrContact) {
      hits.push({
        id: "G",
        label: "Weak sender identity — sign-off needs role or contact info, not just first name and company",
        delta: -12,
        severity: "warn",
      });
    }
  }

  if (body.includes("—") || subject.includes("—")) {
    hits.push({
      id: "H",
      label: "Em dash in copy (use comma, period, or new line instead)",
      delta: -10,
      severity: "warn",
    });
  }


  const followUpOnly = [
    "just following up",
    "wanted to follow up",
    "checking in",
    "following up on my",
    "circling back",
  ];
  if (sequencePosition === 2) {
    const matchedFollowUp = followUpOnly.find((p) => lowerBody.includes(p));
    const hasNewValue =
      Boolean(ctx.giftingHook && lowerBody.includes(ctx.giftingHook.toLowerCase().slice(0, 12))) ||
      Boolean(account?.industry && lowerBody.includes(account.industry.toLowerCase())) ||
      /case study|proof|deadline|teams in|recently|last week|season/i.test(lowerBody);
    if (matchedFollowUp && !hasNewValue) {
      hits.push({
        id: "I",
        label: "Email 2 reads as follow-up only; add new value (proof point, angle, or urgency)",
        delta: -15,
        severity: "critical",
      });
    }
  }

  if (sequencePosition === 3 && wordCount > 90) {
    hits.push({
      id: "J",
      label: "Breakup email should stay short and human (under 70 words)",
      delta: -10,
      severity: "warn",
    });
  }

  if (sequencePosition <= 2) {
    const pitchParts = body.trim().split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
    const pitch = pitchParts.length > 2 ? pitchParts.slice(1, -1).join(" ") : pitchParts.slice(1).join(" ");
    const sentenceCount = pitch
      ? pitch.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0).length
      : 0;
    if (sentenceCount > 3) {
      hits.push({
        id: "K",
        label: "Pitch body exceeds 3 sentences for emails 1-2",
        delta: -10,
        severity: "warn",
      });
    }
  }

  return hits;
}
