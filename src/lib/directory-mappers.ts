import type { DirectoryCompany, DirectoryContact } from "@/lib/api-client";
import type { Company, Person } from "@/lib/scouting-data";

export function directoryCompanyToCard(company: DirectoryCompany): Company {
  return {
    id: company.id,
    logo: "",
    domain: company.domain,
    name: company.name,
    type: company.industry,
    city: company.city,
    industry: company.industry,
    employees: company.employees,
    revenue: "—",
    founded: 0,
    giftScore: company.giftScore,
    giftBudget: "—",
    pastGifting: [],
    intelligenceNotes: "",
    overview: company.companyOverview,
    accountId: company.id,
  };
}

export function directoryContactToPerson(
  contact: DirectoryContact | (DirectoryCompany["contacts"][number] & { companyId: string }),
  companyId?: string,
  companyName?: string,
): Person {
  const resolvedCompanyId =
    "companyId" in contact && contact.companyId ? contact.companyId : companyId ?? "";

  return {
    id: contact.leadId,
    companyId: resolvedCompanyId,
    name: contact.name,
    title: contact.title,
    department: "—",
    seniority: "—",
    isKeyDecisionMaker: contact.isKeyDM ?? false,
    matchScore: contact.score,
    engagementSignals: [],
    linkedIn: contact.linkedIn ?? "",
    email: contact.email,
    phone: contact.phone ?? "",
    bio: "",
  };
}
