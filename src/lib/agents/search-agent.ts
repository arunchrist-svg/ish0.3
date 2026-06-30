import { parseSearchQuery, resolveCompany, resolvePerson } from "@/lib/enrichment/entity-resolver";
import { findRelatedLeads } from "@/lib/enrichment/related-leads";
import { scorePerson, sortPeopleByScore } from "@/lib/enrichment/seniority-score";
import { getAgentFlags } from "@/lib/settings/agent-flags";
import type { ScoutCompanyResult, ScoutPersonResult } from "@/lib/enrichment/types";
import type { RelatedLead } from "@/lib/enrichment/related-leads";

export type ExactSearchResult = {
  primaryCompany?: ScoutCompanyResult;
  primaryPerson?: ScoutPersonResult;
  companyCandidates: Awaited<ReturnType<typeof resolveCompany>>;
  personCandidates: Awaited<ReturnType<typeof resolvePerson>>;
  peers: RelatedLead[];
  lookalikes: RelatedLead[];
  confidence: number;
  warnings: string[];
};

export async function runExactSearch(params: {
  tenantId: string;
  workspaceId: string;
  query: string;
  personName?: string;
  city?: string;
  selectedCompanyIndex?: number;
  selectedPersonIndex?: number;
}): Promise<ExactSearchResult> {
  const flags = await getAgentFlags(params.workspaceId);
  const threshold = flags.searchConfidenceThreshold ?? 0.85;
  const warnings: string[] = [];

  const parsed = await parseSearchQuery(params.query, params.personName, params.city);
  const companyCandidates = await resolveCompany(parsed);
  const companyPick = companyCandidates[params.selectedCompanyIndex ?? 0];
  const primaryCompany = companyPick?.item;

  const personCandidates = await resolvePerson(parsed, primaryCompany);
  const personPick = personCandidates[params.selectedPersonIndex ?? 0];
  let primaryPerson = personPick?.item;

  if (primaryPerson) {
    primaryPerson = scorePerson(primaryPerson);
  }

  const confidence = personPick?.confidence ?? companyPick?.confidence ?? 0;
  if (confidence < threshold && confidence >= 0.5) {
    warnings.push("Match confidence is moderate. Please confirm before saving.");
  }
  if (confidence < 0.5) {
    warnings.push("No confident match found. Try adding city or LinkedIn URL.");
  }

  const related = primaryCompany
    ? await findRelatedLeads({
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        companyName: primaryCompany.name,
        companyDomain: primaryCompany.domain,
        primaryPersonName: primaryPerson?.name,
        title: primaryPerson?.title,
        industry: primaryCompany.industry,
        city: primaryCompany.city ?? parsed.city,
      })
    : [];

  const peers = related.filter((r) => r.reason.startsWith("Also at"));
  const lookalikes = related.filter((r) => !r.reason.startsWith("Also at"));

  if (peers.length) {
    peers.forEach((p, i) => {
      peers[i] = { ...p, person: scorePerson(p.person) };
    });
  }

  return {
    primaryCompany,
    primaryPerson,
    companyCandidates,
    personCandidates: personCandidates
      .map((c) => ({ ...c, item: scorePerson(c.item) }))
      .sort((a, b) => b.confidence - a.confidence),
    peers,
    lookalikes,
    confidence,
    warnings,
  };
}
