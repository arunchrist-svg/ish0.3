import { normalizeEmail } from "@/lib/utils";
import type { NetworkInputConnection, NetworkInputMember } from "./assemble";

export type OrgNetworkUser = {
  id: string;
  name: string;
  email: string | null;
  linkedIn?: string | null;
};

export type LinkedInNetworkMember = {
  id: string;
  userId?: string | null;
  name: string;
  email?: string | null;
  linkedInUrl?: string | null;
  connections: NetworkInputConnection[];
};

/** Settings users are the team. Orphan LinkedIn imports (e.g. ISH Cluster Mgr) are dropped. */
export function resolveNetworkMembers(
  orgUsers: OrgNetworkUser[],
  linkedInMembers: LinkedInNetworkMember[],
): NetworkInputMember[] {
  const usedLiIds = new Set<string>();

  return orgUsers.map((user) => {
    const email = normalizeEmail(user.email);
    const match =
      linkedInMembers.find((m) => m.userId && m.userId === user.id && !usedLiIds.has(m.id)) ??
      linkedInMembers.find((m) => email && normalizeEmail(m.email) === email && !usedLiIds.has(m.id));

    if (match) usedLiIds.add(match.id);

    return {
      id: user.id,
      name: user.name,
      email: user.email ?? undefined,
      linkedIn: user.linkedIn ?? match?.linkedInUrl ?? undefined,
      connections: match?.connections ?? [],
    };
  });
}
