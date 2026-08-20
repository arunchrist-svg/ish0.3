import rulesConfig from "@/lib/email/content-rules.config.json";

/** Client-safe domain helpers. Keep Node `dns` out of this file. */

export function extractDomain(emailOrDomain: string): string {
  const trimmed = emailOrDomain.trim().toLowerCase();
  if (trimmed.includes("@")) return trimmed.split("@").pop() ?? trimmed;
  return trimmed;
}

export function isPersonalInboxDomain(emailOrDomain: string): boolean {
  const domain = extractDomain(emailOrDomain);
  return rulesConfig.personalInboxDomains.includes(domain);
}
