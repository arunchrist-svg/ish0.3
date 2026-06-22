import { db, contacts } from "@/db";
import { eq } from "drizzle-orm";
import { matchConnectionToContact, connectionAtAccount } from "./match";
import { relationshipLabel, sortWarmIntros } from "./strength";
import type { NetworkGraph, NetworkNode, NetworkEdge, WarmIntro } from "./types";

type MemberWithConnections = {
  id: string;
  name: string;
  email: string | null;
  connections: {
    id: string;
    firstName: string;
    lastName: string;
    linkedInUrl: string;
    email: string | null;
    company: string | null;
    position: string | null;
  }[];
};

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

  const members = await db.query.teamMembers.findMany({
    with: { connections: true },
  }) as MemberWithConnections[];

  const nodes = new Map<string, NetworkNode>();
  const edges: NetworkEdge[] = [];
  const warmIntros: WarmIntro[] = [];
  const seenIntroKeys = new Set<string>();

  const targetId = `target:${targetContact.id}`;
  nodes.set(targetId, {
    id: targetId,
    type: "target",
    name: targetContact.name,
    email: targetContact.email ?? undefined,
    linkedIn: targetContact.linkedIn ?? undefined,
    title: targetContact.title ?? undefined,
  });

  for (const colleague of colleagues) {
    const nodeId = `colleague:${colleague.id}`;
    nodes.set(nodeId, {
      id: nodeId,
      type: "colleague",
      name: colleague.name,
      email: colleague.email ?? undefined,
      linkedIn: colleague.linkedIn ?? undefined,
      title: colleague.title ?? undefined,
    });
    edges.push({
      from: nodeId,
      to: targetId,
      kind: "crm_colleague",
      strength: 1,
    });
  }

  function addIntro(intro: WarmIntro) {
    const key = `${intro.connectorName}|${intro.path.join(">")}|${intro.strength}`;
    if (seenIntroKeys.has(key)) return;
    seenIntroKeys.add(key);
    warmIntros.push(intro);
  }

  for (const member of members) {
    const connectorId = `connector:${member.id}`;
    nodes.set(connectorId, {
      id: connectorId,
      type: "connector",
      name: member.name,
      email: member.email ?? undefined,
    });

    for (const conn of member.connections) {
      const connName = `${conn.firstName} ${conn.lastName}`.trim();
      const bridgeId = `bridge:${conn.id}`;
      const connectionLike = {
        id: conn.id,
        firstName: conn.firstName,
        lastName: conn.lastName,
        linkedInUrl: conn.linkedInUrl,
        email: conn.email,
        company: conn.company,
      };

      const targetMatch = matchConnectionToContact(connectionLike, targetContact, account.name);
      if (targetMatch) {
        nodes.set(bridgeId, {
          id: bridgeId,
          type: "bridge",
          name: connName,
          email: conn.email ?? undefined,
          linkedIn: conn.linkedInUrl,
          title: conn.position ?? undefined,
        });
        edges.push({
          from: connectorId,
          to: bridgeId,
          kind: "linkedin_direct",
          strength: 4,
        });
        edges.push({
          from: bridgeId,
          to: targetId,
          kind: "linkedin_direct",
          strength: 4,
        });
        const path = [member.name, connName, targetContact.name];
        addIntro({
          connectorName: member.name,
          connectorEmail: member.email ?? undefined,
          connectorId: member.id,
          name: targetContact.name,
          email: targetContact.email ?? undefined,
          linkedIn: targetContact.linkedIn ?? undefined,
          path,
          strength: 4,
          relationship: relationshipLabel(4, path),
        });
        continue;
      }

      for (const colleague of colleagues) {
        const colleagueMatch = matchConnectionToContact(connectionLike, colleague, account.name);
        if (colleagueMatch) {
          const colleagueNodeId = `colleague:${colleague.id}`;
          nodes.set(bridgeId, {
            id: bridgeId,
            type: "bridge",
            name: connName,
            email: conn.email ?? undefined,
            linkedIn: conn.linkedInUrl,
            title: conn.position ?? undefined,
          });
          edges.push({
            from: connectorId,
            to: bridgeId,
            kind: "linkedin_direct",
            strength: 3,
          });
          edges.push({
            from: bridgeId,
            to: colleagueNodeId,
            kind: "linkedin_direct",
            strength: 3,
          });
          const path = [member.name, connName, colleague.name, targetContact.name];
          addIntro({
            connectorName: member.name,
            connectorEmail: member.email ?? undefined,
            connectorId: member.id,
            name: colleague.name,
            email: colleague.email ?? undefined,
            linkedIn: colleague.linkedIn ?? undefined,
            path,
            strength: 3,
            relationship: relationshipLabel(3, path),
          });
        }
      }

      if (!targetMatch && connectionAtAccount(connectionLike, account.name)) {
        nodes.set(bridgeId, {
          id: bridgeId,
          type: "bridge",
          name: connName,
          email: conn.email ?? undefined,
          linkedIn: conn.linkedInUrl,
          title: conn.position ?? undefined,
        });
        edges.push({
          from: connectorId,
          to: bridgeId,
          kind: "intro_path",
          strength: 2,
        });
        edges.push({
          from: bridgeId,
          to: targetId,
          kind: "intro_path",
          strength: 2,
        });
        const path = [member.name, connName, targetContact.name];
        addIntro({
          connectorName: member.name,
          connectorEmail: member.email ?? undefined,
          connectorId: member.id,
          name: connName,
          email: conn.email ?? undefined,
          linkedIn: conn.linkedInUrl,
          path,
          strength: 2,
          relationship: relationshipLabel(2, path),
        });
      }
    }
  }

  // CRM-only colleagues without LinkedIn path
  for (const colleague of colleagues) {
    const hasPath = warmIntros.some(
      (w) => w.name === colleague.name || w.path.includes(colleague.name),
    );
    if (!hasPath) {
      const path = [colleague.name, targetContact.name];
      addIntro({
        connectorName: "CRM",
        name: colleague.name,
        email: colleague.email ?? undefined,
        linkedIn: colleague.linkedIn ?? undefined,
        path,
        strength: 1,
        relationship: relationshipLabel(1, path),
      });
    }
  }

  const sorted = sortWarmIntros(warmIntros);

  return {
    nodes: Array.from(nodes.values()),
    edges,
    warmIntros: sorted,
    summary: {
      directPaths: sorted.filter((w) => w.strength >= 4).length,
      colleaguePaths: sorted.filter((w) => w.strength === 3).length,
      lastComputedAt: new Date().toISOString(),
    },
  };
}

export async function getLeadNetworkSummary(leadId: string, limit = 5) {
  const graph = await buildLeadNetworkGraph(leadId);
  if (!graph) return [];
  const { toSummaryItems } = await import("./strength");
  return toSummaryItems(graph.warmIntros, limit);
}
