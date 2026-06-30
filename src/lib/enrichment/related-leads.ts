import { db, accounts, contacts } from "@/db";
import { eq, and, ne, ilike } from "drizzle-orm";
import { discoverPeople } from "@/lib/enrichment/waterfall";
import { sortPeopleByScore } from "@/lib/enrichment/seniority-score";
import type { ScoutPersonResult } from "@/lib/enrichment/types";

export type RelatedLead = {
  person: ScoutPersonResult;
  reason: string;
  score: number;
  warmPath?: string;
};

export async function findSameCompanyPeers(params: {
  tenantId: string;
  workspaceId: string;
  companyName: string;
  companyDomain?: string;
  excludeName?: string;
  limit?: number;
}): Promise<RelatedLead[]> {
  const { people } = await discoverPeople({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    companyName: params.companyName,
    companyDomain: params.companyDomain,
    limit: params.limit ?? 12,
  });

  return sortPeopleByScore(people)
    .filter((p) => !params.excludeName || p.name.toLowerCase() !== params.excludeName.toLowerCase())
    .slice(0, 8)
    .map((p) => ({
      person: p,
      reason: `Also at ${params.companyName}`,
      score: p.matchScore ?? 50,
    }));
}

export async function findIndustryLookalikes(params: {
  tenantId: string;
  title?: string | null;
  industry?: string | null;
  city?: string | null;
  excludeAccountId?: string;
  limit?: number;
}): Promise<RelatedLead[]> {
  if (!params.industry && !params.title) return [];

  const rows = await db
    .select({
      contactId: contacts.id,
      name: contacts.name,
      title: contacts.title,
      email: contacts.email,
      emailStatus: contacts.emailStatus,
      linkedIn: contacts.linkedIn,
      isKeyDM: contacts.isKeyDM,
      company: accounts.name,
      industry: accounts.industry,
      city: accounts.city,
      accountId: accounts.id,
    })
    .from(contacts)
    .innerJoin(accounts, eq(contacts.accountId, accounts.id))
    .where(
      and(
        eq(contacts.tenantId, params.tenantId),
        params.excludeAccountId ? ne(accounts.id, params.excludeAccountId) : undefined,
        params.industry ? ilike(accounts.industry, `%${params.industry}%`) : undefined,
        params.city ? ilike(accounts.city, `%${params.city}%`) : undefined,
        params.title ? ilike(contacts.title, `%${params.title.split(" ")[0]}%`) : undefined,
      ),
    )
    .limit(params.limit ?? 8);

  return rows.map((r) => ({
    person: {
      name: r.name,
      title: r.title ?? undefined,
      email: r.email ?? undefined,
      emailStatus: (r.emailStatus ?? "missing") as ScoutPersonResult["emailStatus"],
      linkedIn: r.linkedIn ?? undefined,
      isKeyDM: r.isKeyDM ?? undefined,
      matchScore: r.isKeyDM ? 70 : 55,
      dataSource: "internal",
    },
    reason: r.industry ? `Similar role in ${r.industry}` : `At ${r.company}`,
    score: r.isKeyDM ? 70 : 55,
  }));
}

export async function findRelatedLeads(params: {
  tenantId: string;
  workspaceId: string;
  companyName: string;
  companyDomain?: string;
  primaryPersonName?: string;
  title?: string | null;
  industry?: string | null;
  city?: string | null;
  excludeAccountId?: string;
}): Promise<RelatedLead[]> {
  const peers = await findSameCompanyPeers({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    companyName: params.companyName,
    companyDomain: params.companyDomain,
    excludeName: params.primaryPersonName,
    limit: 6,
  });

  const lookalikes = await findIndustryLookalikes({
    tenantId: params.tenantId,
    title: params.title,
    industry: params.industry,
    city: params.city,
    excludeAccountId: params.excludeAccountId,
    limit: 4,
  });

  const seen = new Set<string>();
  const merged: RelatedLead[] = [];
  for (const item of [...peers, ...lookalikes]) {
    const key = `${item.person.name}|${item.person.title ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged.slice(0, 8);
}
