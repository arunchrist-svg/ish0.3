import { isGenericCompanyEmail, sanitizeEmail, sanitizePhone } from "./validate-contact";
import { runLocalVerification } from "./local-verify";
import type { EnrichmentProviderId } from "./enrich-types";
import type { EnrichedContact, EnrichmentInput } from "./enrich-types";

const RISK_PENALTY = { safe: 0, caution: 8, warning: 25, high_risk: 100 } as const;

export function getEmailConfidenceAutoAccept(): number {
  const raw = process.env.EMAIL_CONFIDENCE_AUTO_ACCEPT ?? "55";
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 55;
}

export function getEmailConfidenceGenericAccept(): number {
  const raw = process.env.EMAIL_CONFIDENCE_GENERIC_ACCEPT ?? "40";
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : 40;
}

export function scoreContactCandidate(
  input: EnrichmentInput,
  contact: Partial<EnrichedContact>,
  providerId: EnrichmentProviderId,
): number {
  let score = 0;
  const email = sanitizeEmail(contact.email);
  const phone = sanitizePhone(contact.phone);

  if (email) score += isGenericCompanyEmail(email) ? 8 : 40;
  if (phone) score += 30;
  if (contact.linkedinUrl || input.linkedinUrl) score += 5;

  switch (providerId) {
    case "hunter":
      score += 20;
      break;
    case "apollo":
      score += 15;
      break;
    case "website_email":
    case "web_snippets":
    case "google_places":
    case "ai_research":
      score -= 12;
      break;
  }

  if (input.name?.trim() && email && isGenericCompanyEmail(email)) score -= 15;

  const verification = runLocalVerification({
    name: input.name,
    company: input.company,
    email: contact.email,
    phone: contact.phone,
  });
  score -= RISK_PENALTY[verification.riskLevel];

  return Math.max(0, Math.min(100, score));
}

export function isNamedPerson(name?: string | null): boolean {
  if (!name?.trim()) return false;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length >= 2 && parts.every((p) => p.length >= 2);
}

export function shouldAutoAcceptEmail(
  score: number,
  email?: string | null,
  options?: { namedPerson?: boolean },
): boolean {
  const e = sanitizeEmail(email);
  if (!e) return false;
  if (isGenericCompanyEmail(e)) {
    if (options?.namedPerson) return false;
    return score >= getEmailConfidenceGenericAccept();
  }
  return score >= getEmailConfidenceAutoAccept();
}

export type ConfidenceTier = "good" | "generic" | "missing" | "low";

export function confidenceTier(score: number, email?: string | null): ConfidenceTier {
  const e = sanitizeEmail(email);
  if (!e) return "missing";
  if (shouldAutoAcceptEmail(score, e)) {
    return isGenericCompanyEmail(e) ? "generic" : "good";
  }
  return "low";
}

export function confidenceLabel(tier: ConfidenceTier): string {
  switch (tier) {
    case "good":
      return "Good";
    case "generic":
      return "Generic";
    case "low":
      return "Low";
    default:
      return "Missing";
  }
}
