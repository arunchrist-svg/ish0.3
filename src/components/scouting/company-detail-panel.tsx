import type { Company } from "@/lib/scouting-data";
import { CompanyOverviewPanel } from "@/components/company/company-overview-panel";

type Props = {
  company: Company;
  decisionMakerHint?: string;
  decisionMakerLeadId?: string;
};

export function CompanyDetailPanel({ company, decisionMakerHint, decisionMakerLeadId }: Props) {
  const dmHint = decisionMakerHint ?? company.overview?.decisionMaker;

  return (
    <CompanyOverviewPanel
      name={company.name}
      logo={company.logo}
      domain={company.domain}
      city={company.city}
      giftScore={company.giftScore}
      industry={company.industry || company.type}
      initialOverview={company.overview}
      decisionMakerLeadId={decisionMakerLeadId}
      overviewInput={{
        name: company.name,
        city: company.city,
        industry: company.industry || company.type,
        domain: company.domain,
        employees: company.employees !== "—" ? company.employees : undefined,
        giftBudget: company.giftBudget !== "—" ? company.giftBudget : undefined,
        giftScore: company.giftScore,
        intelligenceNotes: company.intelligenceNotes || undefined,
        accountId: company.accountId,
        decisionMakerHint: dmHint,
      }}
    />
  );
}
