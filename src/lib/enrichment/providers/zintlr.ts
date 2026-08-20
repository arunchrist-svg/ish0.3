import { linkedInSlug, normalizeLinkedInUrl } from "@/lib/utils";
import { pickBestPhone, sanitizePhone } from "../validate-contact";
import { hasZintlrKeys } from "../config";
import { getZintlrAccessToken, getZintlrSecretKey } from "../request-context";
import type { EnrichmentInput, EnrichmentProvider, EnrichmentResult } from "../enrich-types";

const BASE = "https://b2b2b.zintlr.com";

function personLinkedInUrl(raw?: string): string | undefined {
  const url = normalizeLinkedInUrl(raw);
  if (!url || !linkedInSlug(url)) return undefined;
  return url;
}

function collectPhones(payload: unknown): string[] {
  const found = new Set<string>();

  const visit = (value: unknown, keyHint = ""): void => {
    if (typeof value === "string" || typeof value === "number") {
      if (keyHint && !/phone|mobile|dial|tel/i.test(keyHint) && value.toString().includes("@")) {
        return;
      }
      const phone = sanitizePhone(String(value));
      if (phone) found.add(phone);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item, keyHint);
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, nested] of Object.entries(value)) {
        visit(nested, key);
      }
    }
  };

  visit(payload);
  return Array.from(found);
}

async function zintlrPost(path: string, body: object): Promise<unknown> {
  const token = getZintlrAccessToken();
  const secret = getZintlrSecretKey();
  if (!token || !secret) throw new Error("Zintlr keys are not set");

  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Access-Token": token,
      "Secret-Key": secret,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zintlr ${path} failed: ${res.status} ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<unknown>;
}

async function unlockFromLinkedIn(linkedinUrl: string): Promise<string | undefined> {
  const data = await zintlrPost("/b2b2b/v1/ln-url-to-ph-email/", {
    ln_url: linkedinUrl,
    phone_unlock: true,
    email_unlock: false,
  });
  return pickBestPhone(collectPhones(data));
}

async function unlockFromEmail(email: string): Promise<string | undefined> {
  const data = await zintlrPost("/b2b2b/v1/email-to-phone/", {
    emails: [email],
  });
  return pickBestPhone(collectPhones(data));
}

export const zintlrEnrichProvider: EnrichmentProvider = {
  id: "zintlr",
  name: "Zintlr India mobile",
  capabilities: ["enrich"],
  isConfigured: () => hasZintlrKeys(),

  async enrich(input: EnrichmentInput): Promise<EnrichmentResult | null> {
    if (!hasZintlrKeys()) return null;

    const linkedinUrl = personLinkedInUrl(input.linkedinUrl);
    const email = input.email?.trim();
    if (!linkedinUrl && !email) return null;

    try {
      const phone = linkedinUrl
        ? await unlockFromLinkedIn(linkedinUrl)
        : await unlockFromEmail(email!);
      if (!phone) return null;

      return {
        providerId: "zintlr",
        contact: {
          name: input.name,
          title: input.title,
          company: input.company,
          city: input.city,
          email: input.email,
          phone,
          linkedinUrl: linkedinUrl ?? input.linkedinUrl,
        },
      };
    } catch (e) {
      console.error("[zintlr] failed:", e);
      return null;
    }
  },
};
