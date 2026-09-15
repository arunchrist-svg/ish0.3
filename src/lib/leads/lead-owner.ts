import { db, orgMembers, userEmailSettings, users, workspaces } from "@/db";
import { and, eq } from "drizzle-orm";
import { loadWorkspaceEmailOverrides } from "@/lib/settings/email-settings";

export type LeadOwnerMailbox = {
  userId: string;
  name: string;
  email: string;
  fromAddress: string;
};

export async function resolveLeadOwnerUserId(params: {
  tenantId: string;
  workspaceId: string;
  fallbackUserId?: string;
}): Promise<string | undefined> {
  const configured = (await loadWorkspaceEmailOverrides(params.workspaceId)).defaultLeadOwnerUserId?.trim();
  if (configured && (await isActiveTenantMember(params.tenantId, configured))) {
    return configured;
  }
  const fallback = params.fallbackUserId?.trim();
  return fallback || undefined;
}

async function isActiveTenantMember(tenantId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: orgMembers.id })
    .from(orgMembers)
    .where(
      and(eq(orgMembers.tenantId, tenantId), eq(orgMembers.userId, userId), eq(orgMembers.status, "active")),
    )
    .limit(1);
  return Boolean(row);
}

export async function listLeadOwnerMailboxes(workspaceId: string): Promise<LeadOwnerMailbox[]> {
  const [workspace] = await db
    .select({ tenantId: workspaces.tenantId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) return [];

  const people = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      emailConfig: userEmailSettings.emailConfig,
    })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .leftJoin(
      userEmailSettings,
      and(eq(userEmailSettings.userId, users.id), eq(userEmailSettings.workspaceId, workspaceId)),
    )
    .where(and(eq(orgMembers.tenantId, workspace.tenantId), eq(orgMembers.status, "active")));

  return people
    .map((person) => {
      const fromAddress =
        (person.emailConfig as { fromAddress?: string } | null)?.fromAddress?.trim() || person.email;
      return {
        userId: person.userId,
        name: person.name?.trim() || person.email,
        email: person.email,
        fromAddress,
      };
    })
    .filter((person) => person.fromAddress)
    .sort((a, b) => a.name.localeCompare(b.name));
}
