import { linkedInSlug } from "@/lib/utils";
import {
  connectionDegree,
  degreeCta,
  degreeRelationshipLabel,
  formatHeadline,
} from "./degree";
import { connectionAtAccount, matchConnectionToContact, namesMatch } from "./match";
import { personToWarmIntro, sortNetworkPeople, sortWarmIntros } from "./strength";
import type { NetworkEdge, NetworkGraph, NetworkNode, NetworkPerson } from "./types";

export type NetworkInputContact = {
  id: string;
  name: string;
  email?: string | null;
  linkedIn?: string | null;
  title?: string | null;
};

export type NetworkInputConnection = {
  id: string;
  firstName: string;
  lastName: string;
  linkedInUrl: string;
  email?: string | null;
  company?: string | null;
  position?: string | null;
};

export type NetworkInputMember = {
  id: string;
  name: string;
  email?: string | null;
  linkedIn?: string | null;
  connections: NetworkInputConnection[];
};

type PersonAcc = {
  id: string;
  source: "target" | "crm" | "linkedin";
  name: string;
  title?: string;
  email?: string;
  linkedIn?: string;
  directMemberIds: string[];
  directMemberNames: string[];
  directMemberEmails: (string | undefined)[];
};

function addDirectMember(person: PersonAcc, member: NetworkInputMember) {
  if (person.directMemberIds.includes(member.id)) return;
  person.directMemberIds.push(member.id);
  person.directMemberNames.push(member.name);
  person.directMemberEmails.push(member.email ?? undefined);
}

function findExistingPerson(
  people: Map<string, PersonAcc>,
  conn: NetworkInputConnection,
): PersonAcc | undefined {
  const slug = linkedInSlug(conn.linkedInUrl);
  const connName = `${conn.firstName} ${conn.lastName}`.trim();
  for (const person of people.values()) {
    if (slug && linkedInSlug(person.linkedIn) === slug) return person;
    if (namesMatch(person.name, connName)) return person;
  }
  return undefined;
}

function toNetworkPerson(
  acc: PersonAcc,
  opts: {
    companyName: string;
    isDirect: boolean;
    hasFirstDegreeAtCompany: boolean;
    firstDegreePeople: PersonAcc[];
    target: PersonAcc;
  },
): NetworkPerson {
  const degree = connectionDegree({
    isDirectConnection: opts.isDirect,
    hasFirstDegreeAtCompany: opts.hasFirstDegreeAtCompany,
  });

  const mutualNames =
    degree === "1st"
      ? acc.directMemberNames
      : opts.firstDegreePeople.filter((p) => p.id !== acc.id).map((p) => p.name);

  const connectorName =
    degree === "1st"
      ? acc.directMemberNames[0]
      : opts.firstDegreePeople.find((p) => p.id !== acc.id)?.directMemberNames[0];
  const connectorId =
    degree === "1st"
      ? acc.directMemberIds[0]
      : opts.firstDegreePeople.find((p) => p.id !== acc.id)?.directMemberIds[0];
  const connectorEmail =
    degree === "1st"
      ? acc.directMemberEmails[0]
      : opts.firstDegreePeople.find((p) => p.id !== acc.id)?.directMemberEmails[0];

  let path: string[] = [acc.name];
  if (degree === "1st" && acc.directMemberNames[0]) {
    path = [acc.directMemberNames[0], acc.name];
  } else if (degree === "2nd") {
    const mutual =
      opts.firstDegreePeople.find((p) => p.id !== acc.id) ??
      (opts.target.directMemberIds.length > 0 && opts.target.id !== acc.id ? opts.target : undefined);
    if (mutual?.directMemberNames[0]) {
      path = [mutual.directMemberNames[0], mutual.name, acc.name];
    }
  }

  return {
    id: acc.id,
    name: acc.name,
    headline: formatHeadline(acc.title, opts.companyName),
    title: acc.title,
    email: acc.email,
    linkedIn: acc.linkedIn,
    degree,
    relationship: degreeRelationshipLabel(degree, {
      connectorName,
      mutualNames,
      company: opts.companyName,
    }),
    connectorName,
    connectorId,
    connectorEmail,
    mutualNames,
    path,
    cta: degreeCta(degree),
  };
}

export function assembleCompanyNetwork(input: {
  target: NetworkInputContact;
  accountName: string;
  colleagues: NetworkInputContact[];
  members: NetworkInputMember[];
}): NetworkGraph {
  const { target, accountName, colleagues, members } = input;
  const people = new Map<string, PersonAcc>();
  const nodes = new Map<string, NetworkNode>();
  const edges: NetworkEdge[] = [];

  const targetId = `target:${target.id}`;
  people.set(targetId, {
    id: targetId,
    source: "target",
    name: target.name,
    title: target.title ?? undefined,
    email: target.email ?? undefined,
    linkedIn: target.linkedIn ?? undefined,
    directMemberIds: [],
    directMemberNames: [],
    directMemberEmails: [],
  });
  nodes.set(targetId, {
    id: targetId,
    type: "target",
    name: target.name,
    email: target.email ?? undefined,
    linkedIn: target.linkedIn ?? undefined,
    title: target.title ?? undefined,
  });

  for (const colleague of colleagues) {
    const nodeId = `colleague:${colleague.id}`;
    people.set(nodeId, {
      id: nodeId,
      source: "crm",
      name: colleague.name,
      title: colleague.title ?? undefined,
      email: colleague.email ?? undefined,
      linkedIn: colleague.linkedIn ?? undefined,
      directMemberIds: [],
      directMemberNames: [],
      directMemberEmails: [],
    });
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

  const ensureConnector = (member: NetworkInputMember) => {
    const connectorId = `connector:${member.id}`;
    if (!nodes.has(connectorId)) {
      nodes.set(connectorId, {
        id: connectorId,
        type: "connector",
        name: member.name,
        email: member.email ?? undefined,
        linkedIn: member.linkedIn ?? undefined,
      });
    }
    return connectorId;
  };

  for (const member of members) {
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

      const targetMatch = matchConnectionToContact(connectionLike, target, accountName);
      if (targetMatch) {
        const connectorId = ensureConnector(member);
        const acc = people.get(targetId)!;
        addDirectMember(acc, member);
        if (!acc.linkedIn) acc.linkedIn = conn.linkedInUrl;
        if (!acc.title && conn.position) acc.title = conn.position;
        nodes.set(bridgeId, {
          id: bridgeId,
          type: "bridge",
          name: connName,
          email: conn.email ?? undefined,
          linkedIn: conn.linkedInUrl,
          title: conn.position ?? undefined,
        });
        edges.push({ from: connectorId, to: bridgeId, kind: "linkedin_direct", strength: 4 });
        edges.push({ from: bridgeId, to: targetId, kind: "linkedin_direct", strength: 4 });
        continue;
      }

      let matchedColleague = false;
      for (const colleague of colleagues) {
        if (!matchConnectionToContact(connectionLike, colleague, accountName)) continue;
        const connectorId = ensureConnector(member);
        const acc = people.get(`colleague:${colleague.id}`);
        if (acc) {
          addDirectMember(acc, member);
          if (!acc.linkedIn) acc.linkedIn = conn.linkedInUrl;
          if (!acc.title && conn.position) acc.title = conn.position;
        }
        nodes.set(bridgeId, {
          id: bridgeId,
          type: "bridge",
          name: connName,
          email: conn.email ?? undefined,
          linkedIn: conn.linkedInUrl,
          title: conn.position ?? undefined,
        });
        edges.push({ from: connectorId, to: bridgeId, kind: "linkedin_direct", strength: 3 });
        edges.push({
          from: bridgeId,
          to: `colleague:${colleague.id}`,
          kind: "linkedin_direct",
          strength: 3,
        });
        matchedColleague = true;
        break;
      }
      if (matchedColleague) continue;

      if (!connectionAtAccount(connectionLike, accountName)) continue;

      const connectorId = ensureConnector(member);
      const existing = findExistingPerson(people, conn);
      const acc =
        existing ??
        (() => {
          const id = `li:${conn.id}`;
          const created: PersonAcc = {
            id,
            source: "linkedin",
            name: connName,
            title: conn.position ?? undefined,
            email: conn.email ?? undefined,
            linkedIn: conn.linkedInUrl,
            directMemberIds: [],
            directMemberNames: [],
            directMemberEmails: [],
          };
          people.set(id, created);
          return created;
        })();
      addDirectMember(acc, member);
      if (!acc.linkedIn) acc.linkedIn = conn.linkedInUrl;
      if (!acc.title && conn.position) acc.title = conn.position;

      nodes.set(bridgeId, {
        id: bridgeId,
        type: "bridge",
        name: connName,
        email: conn.email ?? undefined,
        linkedIn: conn.linkedInUrl,
        title: conn.position ?? undefined,
      });
      edges.push({ from: connectorId, to: bridgeId, kind: "intro_path", strength: 2 });
      edges.push({ from: bridgeId, to: targetId, kind: "intro_path", strength: 2 });
    }
  }

  const targetAcc = people.get(targetId)!;
  const firstDegreePeople = [...people.values()].filter((p) => p.directMemberIds.length > 0);
  const hasFirstDegreeAtCompany = firstDegreePeople.length > 0;

  const toPerson = (acc: PersonAcc) =>
    toNetworkPerson(acc, {
      companyName: accountName,
      isDirect: acc.directMemberIds.length > 0,
      hasFirstDegreeAtCompany,
      firstDegreePeople,
      target: targetAcc,
    });

  const targetPerson = toPerson(targetAcc);
  nodes.set(targetId, { ...nodes.get(targetId)!, degree: targetPerson.degree });

  const otherPeople = sortNetworkPeople(
    [...people.values()].filter((p) => p.source !== "target").map((acc) => {
      const person = toPerson(acc);
      const node = nodes.get(acc.id);
      if (node) node.degree = person.degree;
      else {
        nodes.set(acc.id, {
          id: acc.id,
          type: acc.source === "linkedin" ? "bridge" : "colleague",
          name: acc.name,
          email: acc.email,
          linkedIn: acc.linkedIn,
          title: acc.title,
          degree: person.degree,
        });
      }
      return person;
    }),
  );

  const warmIntros = sortWarmIntros(otherPeople.map(personToWarmIntro));
  const firstDegree = otherPeople.filter((p) => p.degree === "1st").length;
  const secondDegree = otherPeople.filter((p) => p.degree === "2nd").length;
  const thirdDegree = otherPeople.filter((p) => p.degree === "3rd").length;

  return {
    companyName: accountName,
    target: targetPerson,
    people: otherPeople,
    nodes: Array.from(nodes.values()),
    edges,
    warmIntros,
    summary: {
      firstDegree,
      secondDegree,
      thirdDegree,
      directPaths: targetPerson.degree === "1st" ? targetAcc.directMemberIds.length : 0,
      colleaguePaths: firstDegree,
      lastComputedAt: new Date().toISOString(),
      hasLinkedInImport: members.some((m) => m.connections.length > 0),
    },
  };
}
