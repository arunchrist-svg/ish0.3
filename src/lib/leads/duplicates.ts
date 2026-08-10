import { sanitizeEmail } from "@/lib/enrichment/validate-contact";
import { statusToPipelineIndex } from "@/lib/pipeline-status";
import { linkedInSlug } from "@/lib/utils";

const LEGAL_SUFFIXES =
  /\b(private limited|pvt\.?\s*ltd\.?|pvt|ltd|limited|llp|inc|incorporated|corp|corporation|plc|gmbh|llc|co\.?|company)\b/gi;

export type DedupeLeadInput = {
  id: string;
  name: string;
  company: string;
  status: string;
  score?: number | null;
  updatedAt?: Date | string | null;
  email?: string | null;
  linkedIn?: string | null;
};

export type DuplicateLeadGroup<T extends DedupeLeadInput = DedupeLeadInput> = {
  key: string;
  name: string;
  company: string;
  keepId: string;
  leads: T[];
};

function normalizeOrgName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(LEGAL_SUFFIXES, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePersonName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function nameCompanyDedupeKey(name: string, company: string): string | null {
  const person = normalizePersonName(name);
  const org = normalizeOrgName(company);
  if (!person || !org) return null;
  return `nc:${person}|${org}`;
}

function emailDedupeKey(email?: string | null): string | null {
  const cleaned = sanitizeEmail(email);
  return cleaned ? `email:${cleaned}` : null;
}

function linkedInDedupeKey(linkedIn?: string | null): string | null {
  const slug = linkedInSlug(linkedIn);
  return slug ? `li:${slug}` : null;
}

export function compareDuplicateLeads(a: DedupeLeadInput, b: DedupeLeadInput): number {
  const stage = statusToPipelineIndex(b.status) - statusToPipelineIndex(a.status);
  if (stage !== 0) return stage;
  const score = (b.score ?? 0) - (a.score ?? 0);
  if (score !== 0) return score;
  const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
  const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
  if (bTime !== aTime) return bTime - aTime;
  return a.id.localeCompare(b.id);
}

export function pickDuplicateKeeper<T extends DedupeLeadInput>(group: T[]): T {
  return [...group].sort(compareDuplicateLeads)[0]!;
}

class UnionFind {
  private readonly parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }

  find(i: number): number {
    let current = i;
    while (this.parent[current] !== current) {
      this.parent[current] = this.parent[this.parent[current]];
      current = this.parent[current];
    }
    return current;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

function indexByKey(leads: DedupeLeadInput[], keyOf: (lead: DedupeLeadInput) => string | null): Map<string, number[]> {
  const map = new Map<string, number[]>();
  leads.forEach((lead, index) => {
    const key = keyOf(lead);
    if (!key) return;
    const list = map.get(key);
    if (list) list.push(index);
    else map.set(key, [index]);
  });
  return map;
}

export function groupDuplicateLeads<T extends DedupeLeadInput>(leads: T[]): DuplicateLeadGroup<T>[] {
  if (leads.length < 2) return [];

  const uf = new UnionFind(leads.length);
  const buckets = [
    indexByKey(leads, (lead) => nameCompanyDedupeKey(lead.name, lead.company)),
    indexByKey(leads, (lead) => emailDedupeKey(lead.email)),
    indexByKey(leads, (lead) => linkedInDedupeKey(lead.linkedIn)),
  ];

  for (const bucket of buckets) {
    for (const indexes of bucket.values()) {
      for (let i = 1; i < indexes.length; i++) {
        uf.union(indexes[0]!, indexes[i]!);
      }
    }
  }

  const clustered = new Map<number, T[]>();
  leads.forEach((lead, index) => {
    const root = uf.find(index);
    const list = clustered.get(root);
    if (list) list.push(lead);
    else clustered.set(root, [lead]);
  });

  return [...clustered.values()]
    .filter((group) => group.length > 1)
    .map((group) => {
      const keeper = pickDuplicateKeeper(group);
      const key =
        nameCompanyDedupeKey(keeper.name, keeper.company) ??
        emailDedupeKey(keeper.email) ??
        linkedInDedupeKey(keeper.linkedIn) ??
        `id:${keeper.id}`;
      return {
        key,
        name: keeper.name,
        company: keeper.company,
        keepId: keeper.id,
        leads: group.sort(compareDuplicateLeads),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || a.company.localeCompare(b.company));
}

export function countDuplicateExtras<T extends DedupeLeadInput>(leads: T[]): number {
  return groupDuplicateLeads(leads).reduce((sum, group) => sum + group.leads.length - 1, 0);
}
