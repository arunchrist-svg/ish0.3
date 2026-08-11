import { db, contacts, orgMembers, users } from "@/db";
import { and, eq } from "drizzle-orm";
import { assembleCompanyNetwork } from "./assemble";
import { resolveNetworkMembers } from "./members";
import type { NetworkGraph } from "./types";

export async function buildLeadNetworkGraph(leadId: string): Promise<NetworkGraph | null> {
  const leadRow = await db.query.leads.findFirst({
    where: (l, { eq: e }) => e(l.id, leadId),
    with: {
      contact: true,
      account: true,
    },
  });

  if (!leadRow?.contact || !leadRow.account) return null;

  const targetContact = leadRow.contact;
  const account = leadRow.account;

  const colleagueRows = await db
    .select()
    .from(contacts)
    .where(eq(contacts.accountId, account.id));

  const colleagues = colleagueRows.filter((c) => c.id !== targetContact.id);

  const orgUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      linkedIn: users.linkedIn,
    })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(and(eq(orgMembers.tenantId, leadRow.tenantId), eq(orgMembers.status, "active")));

  const linkedInMembers = await db.query.teamMembers.findMany({
    where: (m, { eq: e }) => e(m.tenantId, leadRow.tenantId),
    with: { connections: true },
  });

  const members = resolveNetworkMembers(orgUsers, linkedInMembers);

  return assembleCompanyNetwork({
    target: {
      id: targetContact.id,
      name: targetContact.name,
      email: targetContact.email,
      linkedIn: targetContact.linkedIn,
      title: targetContact.title,
    },
    accountName: account.name,
    colleagues: colleagues.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      linkedIn: c.linkedIn,
      title: c.title,
    })),
    members,
  });
}

export async function getLeadNetworkSummary(leadId: string, limit = 5) {
  const graph = await buildLeadNetworkGraph(leadId);
  if (!graph) return [];
  const { toSummaryItems } = await import("./strength");
  return toSummaryItems(graph.warmIntros, limit);
}
