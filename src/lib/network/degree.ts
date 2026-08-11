export type ConnectionDegree = "1st" | "2nd" | "3rd";

export function connectionDegree(input: {
  isDirectConnection: boolean;
  hasFirstDegreeAtCompany: boolean;
}): ConnectionDegree {
  if (input.isDirectConnection) return "1st";
  if (input.hasFirstDegreeAtCompany) return "2nd";
  return "3rd";
}

export function degreeToStrength(degree: ConnectionDegree): 1 | 2 | 3 | 4 {
  if (degree === "1st") return 4;
  if (degree === "2nd") return 3;
  return 1;
}

export function strengthToDegree(strength: 1 | 2 | 3 | 4): ConnectionDegree {
  if (strength >= 4) return "1st";
  if (strength >= 2) return "2nd";
  return "3rd";
}

export function degreeCta(degree: ConnectionDegree): "connect" | "message" {
  return degree === "2nd" ? "connect" : "message";
}

export function formatHeadline(title?: string | null, company?: string | null): string {
  const t = title?.trim();
  const c = company?.trim();
  if (t && c) return `${t} · ${c}`;
  return t || c || "";
}

export function degreeRelationshipLabel(
  degree: ConnectionDegree,
  opts: { connectorName?: string; mutualNames?: string[]; company?: string } = {},
): string {
  if (degree === "1st") {
    return opts.connectorName ? `Connected to ${opts.connectorName}` : "1st degree connection";
  }
  if (degree === "2nd") {
    const via = opts.mutualNames?.[0] ?? opts.connectorName;
    return via ? `2nd degree via ${via}` : "2nd degree connection";
  }
  return opts.company ? `Works at ${opts.company}` : "3rd degree connection";
}

export function linkedInSearchUrl(name: string, company?: string): string {
  const q = encodeURIComponent([name, company].filter(Boolean).join(" "));
  return `https://www.linkedin.com/search/results/people/?keywords=${q}`;
}
