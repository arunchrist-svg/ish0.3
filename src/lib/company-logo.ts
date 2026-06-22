const KNOWN_DOMAINS: Record<string, string> = {
  "bosch india": "bosch.com",
  "bosch": "bosch.com",
  "infosys mysore": "infosys.com",
  "infosys": "infosys.com",
  "toyota kirloskar": "toyotabharat.com",
  "toyota": "toyota.com",
  "prestige group": "prestigeconstructions.com",
  "titan company": "titan.co.in",
  "titan": "titan.co.in",
  "biocon limited": "biocon.com",
  "biocon": "biocon.com",
  "reliance retail": "relianceretail.com",
  "reliance": "ril.com",
  "abb india": "abb.com",
  "abb": "abb.com",
  "wipro": "wipro.com",
  "tcs": "tcs.com",
  "hcl": "hcltech.com",
  "flipkart": "flipkart.com",
  "swiggy": "swiggy.com",
  "zomato": "zomato.com",
  "razorpay": "razorpay.com",
};

export function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0];
}

export function extractCompanyDomain(input: {
  domain?: string | null;
  website?: string | null;
  name?: string | null;
}): string | undefined {
  if (input.domain) {
    const d = normalizeDomain(input.domain);
    if (d) return d;
  }

  if (input.website) {
    try {
      const url = input.website.startsWith("http") ? input.website : `https://${input.website}`;
      const host = new URL(url).hostname.replace(/^www\./, "");
      if (host) return host;
    } catch {
      const d = normalizeDomain(input.website);
      if (d.includes(".")) return d;
    }
  }

  if (input.name) {
    const key = input.name.trim().toLowerCase();
    if (KNOWN_DOMAINS[key]) return KNOWN_DOMAINS[key];
    for (const [name, domain] of Object.entries(KNOWN_DOMAINS)) {
      if (key.includes(name)) return domain;
    }
  }

  return undefined;
}

export function isLogoUrl(value?: string | null): boolean {
  if (!value) return false;
  return /^https?:\/\//i.test(value) || value.startsWith("//");
}

export function getCompanyLogoSources(input: {
  domain?: string | null;
  website?: string | null;
  name?: string | null;
  logo?: string | null;
}): string[] {
  const sources: string[] = [];
  const domain = extractCompanyDomain(input);

  if (isLogoUrl(input.logo)) sources.push(input.logo!);
  if (domain) {
    sources.push(`https://logo.clearbit.com/${domain}`);
    sources.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`);
    sources.push(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
  }

  return [...new Set(sources)];
}

export function getCompanyInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}
