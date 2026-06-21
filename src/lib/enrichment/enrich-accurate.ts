import { getProvider } from "./providers";
import {
  FREE_ENRICH_PROVIDER_ORDER,
  PAID_ENRICH_PROVIDER_ORDER,
  PAID_PROVIDER_IDS,
  isProviderConfigured,
} from "./provider-config";
import { scoreContactCandidate } from "./confidence";
import type {
  EnrichedContact,
  EnrichmentInput,
  EnrichmentProviderId,
  EnrichmentResult,
} from "./enrich-types";
import {
  isGenericCompanyEmail,
  pickBestEmail,
  pickBestPhone,
  sanitizeEmail,
  sanitizePhone,
} from "./validate-contact";
import { normalizeLinkedInUrl } from "@/lib/utils";
import { runLocalVerification } from "./local-verify";

export interface EnrichContactAccurateOptions {
  allowPaid?: boolean;
  paidOnly?: boolean;
  freeOnly?: boolean;
  stopOnPersonalEmail?: boolean;
}

export interface ProviderAttempt {
  providerId: EnrichmentProviderId;
  status: "success" | "empty" | "error";
  message?: string;
}

export interface ScoredCandidate {
  providerId: EnrichmentProviderId;
  contact: Partial<EnrichedContact>;
  score: number;
  raw?: unknown;
}

function getProviderChain(options: EnrichContactAccurateOptions): EnrichmentProviderId[] {
  if (options.paidOnly) {
    return PAID_ENRICH_PROVIDER_ORDER.filter(isProviderConfigured);
  }
  if (options.freeOnly || options.allowPaid === false) {
    return FREE_ENRICH_PROVIDER_ORDER;
  }
  return [...PAID_ENRICH_PROVIDER_ORDER, ...FREE_ENRICH_PROVIDER_ORDER].filter((id) => {
    if (PAID_PROVIDER_IDS.has(id)) return isProviderConfigured(id);
    return true;
  });
}

function hasUsableContact(contact: Partial<EnrichedContact>): boolean {
  return Boolean(sanitizeEmail(contact.email) || sanitizePhone(contact.phone));
}

function mergeCandidates(
  input: EnrichmentInput,
  candidates: ScoredCandidate[],
): { contact: Partial<EnrichedContact>; providerId: EnrichmentProviderId } | null {
  if (!candidates.length) return null;

  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  const emails = candidates.map((c) => sanitizeEmail(c.contact.email)).filter(Boolean) as string[];
  const phones = candidates.map((c) => sanitizePhone(c.contact.phone)).filter(Boolean) as string[];
  const email = pickBestEmail(emails);
  const phone = pickBestPhone(phones);
  const emailSource = email ? candidates.find((c) => sanitizeEmail(c.contact.email) === email) : undefined;
  const phoneSource = phone ? candidates.find((c) => sanitizePhone(c.contact.phone) === phone) : undefined;
  const primary = emailSource ?? phoneSource ?? best;

  return {
    providerId: primary.providerId,
    contact: {
      ...best.contact,
      name: best.contact.name || input.name,
      title: best.contact.title || input.title,
      company: best.contact.company || input.company,
      city: best.contact.city || input.city,
      email,
      phone,
      linkedinUrl:
        best.contact.linkedinUrl ||
        input.linkedinUrl ||
        emailSource?.contact.linkedinUrl ||
        phoneSource?.contact.linkedinUrl,
    },
  };
}

export async function enrichContactAccurate(
  input: EnrichmentInput,
  options: EnrichContactAccurateOptions = {},
) {
  const normalizedInput: EnrichmentInput = {
    ...input,
    linkedinUrl: normalizeLinkedInUrl(input.linkedinUrl) || input.linkedinUrl,
  };
  const chain = getProviderChain(options);
  if (!chain.length) {
    return {
      contact: null as Partial<EnrichedContact> | null,
      source: "none" as const,
      message: options.paidOnly
        ? "No paid enrichment keys configured. Add APOLLO_API_KEY or HUNTER_API_KEY."
        : "No enrichment providers configured.",
      candidates: [] as ScoredCandidate[],
      attempts: [] as ProviderAttempt[],
    };
  }

  const candidates: ScoredCandidate[] = [];
  const attempts: ProviderAttempt[] = [];

  for (const providerId of chain) {
    const provider = getProvider(providerId);
    if (!provider.isConfigured()) {
      attempts.push({ providerId, status: "empty", message: "Provider not configured" });
      continue;
    }

    try {
      const result: EnrichmentResult | null = await provider.enrich(normalizedInput);
      if (!result?.contact || !hasUsableContact(result.contact)) {
        attempts.push({ providerId, status: "empty", message: "No email or phone returned" });
        continue;
      }

      const score = scoreContactCandidate(normalizedInput, result.contact, providerId);
      candidates.push({ providerId, contact: result.contact, score, raw: result.raw });
      attempts.push({ providerId, status: "success" });

      const email = sanitizeEmail(result.contact.email);
      if (
        options.stopOnPersonalEmail &&
        email &&
        !isGenericCompanyEmail(email) &&
        score >= 35
      ) {
        break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Provider failed";
      attempts.push({ providerId, status: "error", message });
      console.error(`[enrich:${providerId}]`, message);
    }
  }

  const merged = mergeCandidates(normalizedInput, candidates);
  if (!merged) {
    const errors = attempts.filter((a) => a.status === "error").map((a) => `${a.providerId}: ${a.message}`);
    return {
      contact: null,
      source: "none" as const,
      message: errors.length ? `No contact found. ${errors[0]}` : "No enrichment data found for this contact.",
      candidates,
      attempts,
    };
  }

  const topScore = candidates.find((c) => c.providerId === merged.providerId)?.score ?? 0;

  return {
    contact: merged.contact,
    providerId: merged.providerId,
    confidence: topScore,
    source: "provider" as const,
    candidates,
    attempts,
  };
}

export function applyVerificationGate(
  input: EnrichmentInput,
  contact: Partial<EnrichedContact>,
): Partial<EnrichedContact> {
  const verification = runLocalVerification({
    name: input.name,
    company: input.company,
    email: contact.email,
    phone: contact.phone,
  });

  let email = sanitizeEmail(contact.email);
  let phone = sanitizePhone(contact.phone);

  if (phone && (verification.riskLevel === "warning" || verification.riskLevel === "high_risk")) {
    if (verification.checks.some((c) => (c.id === "phone_mangled" || c.id === "phone_invalid") && !c.passed)) {
      phone = undefined;
    }
  }
  if (email && verification.checks.some((c) => c.id === "email_valid" && !c.passed)) {
    email = undefined;
  }

  return { ...contact, email, phone };
}
