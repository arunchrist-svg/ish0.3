/**
 * Wipe CRM / outreach / settings data for srilaksha.ish@gmail.com so she can start fresh.
 * Keeps the user login, membership, tenant shell, and subscription.
 *
 * Usage:
 *   npx tsx scripts/wipe-srilaksha-tenant.ts --dry-run
 *   npx tsx scripts/wipe-srilaksha-tenant.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { eq, inArray } from "drizzle-orm";
import { invalidateEmailConfigCache } from "../src/lib/email/email-sender";

const OWNER_EMAIL = "srilaksha.ish@gmail.com";
const TRIAL_CREDITS = 200;
const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const {
    db,
    users,
    orgMembers,
    orgInvites,
    tenants,
    workspaces,
    workspaceSettings,
    sessions,
    campaigns,
    accounts,
    contacts,
    leads,
    leadResearch,
    leadOutreach,
    outreachEditMessages,
    outreachApprovals,
    outreachSchedule,
    yieldFunnel,
    enrichmentRuns,
    auditEvents,
    consentRecords,
    teamMembers,
    linkedinConnections,
    connectionMatches,
    notifications,
    agentRuns,
    pushSubscriptions,
    creditBalances,
    creditTransactions,
    usageEvents,
    conversionEvents,
  } = await import("../src/db");

  const [user] = await db.select().from(users).where(eq(users.email, OWNER_EMAIL)).limit(1);
  if (!user) {
    throw new Error(`User not found: ${OWNER_EMAIL}`);
  }

  const memberships = await db.select().from(orgMembers).where(eq(orgMembers.userId, user.id));
  if (memberships.length === 0) {
    throw new Error(`No tenant membership for ${OWNER_EMAIL}`);
  }

  const summary: unknown[] = [];

  for (const membership of memberships) {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, membership.tenantId)).limit(1);
    if (!tenant) continue;

    const wsRows = await db.select().from(workspaces).where(eq(workspaces.tenantId, tenant.id));
    const workspaceIds = wsRows.map((w) => w.id);

    const leadRows = await db.select({ id: leads.id }).from(leads).where(eq(leads.tenantId, tenant.id));
    const leadIds = leadRows.map((r) => r.id);
    const contactRows = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.tenantId, tenant.id));
    const contactIds = contactRows.map((r) => r.id);
    const accountRows = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.tenantId, tenant.id));
    const teamRows = await db.select({ id: teamMembers.id }).from(teamMembers).where(eq(teamMembers.tenantId, tenant.id));
    const teamIds = teamRows.map((r) => r.id);

    const outreachRows = leadIds.length
      ? await db.select({ id: leadOutreach.id }).from(leadOutreach).where(inArray(leadOutreach.leadId, leadIds))
      : [];
    const outreachIds = outreachRows.map((r) => r.id);

    const counts = {
      leads: leadIds.length,
      contacts: contactIds.length,
      accounts: accountRows.length,
      campaigns: 0,
      outreach: outreachIds.length,
      notifications: 0,
      agentRuns: 0,
      teamMembers: teamIds.length,
    };

    if (!DRY_RUN) {
      if (leadIds.length > 0) {
        await db.delete(notifications).where(inArray(notifications.leadId, leadIds));
        await db.delete(consentRecords).where(inArray(consentRecords.leadId, leadIds));
        await db.delete(yieldFunnel).where(inArray(yieldFunnel.leadId, leadIds));
        await db.delete(outreachSchedule).where(inArray(outreachSchedule.leadId, leadIds));
        await db.delete(outreachApprovals).where(inArray(outreachApprovals.leadId, leadIds));
        await db.delete(enrichmentRuns).where(inArray(enrichmentRuns.leadId, leadIds));
        await db.delete(agentRuns).where(inArray(agentRuns.leadId, leadIds));
        await db.delete(leadResearch).where(inArray(leadResearch.leadId, leadIds));
      }
      if (outreachIds.length > 0) {
        await db.delete(outreachEditMessages).where(inArray(outreachEditMessages.leadOutreachId, outreachIds));
        await db.delete(leadOutreach).where(inArray(leadOutreach.id, outreachIds));
      }
      if (contactIds.length > 0) {
        await db.delete(connectionMatches).where(inArray(connectionMatches.contactId, contactIds));
        await db.delete(enrichmentRuns).where(inArray(enrichmentRuns.contactId, contactIds));
      }
      if (teamIds.length > 0) {
        await db.delete(linkedinConnections).where(inArray(linkedinConnections.memberId, teamIds));
        await db.delete(teamMembers).where(eq(teamMembers.tenantId, tenant.id));
      }

      counts.notifications = (
        await db.delete(notifications).where(eq(notifications.tenantId, tenant.id)).returning({ id: notifications.id })
      ).length;
      counts.agentRuns = (
        await db.delete(agentRuns).where(eq(agentRuns.tenantId, tenant.id)).returning({ id: agentRuns.id })
      ).length;
      await db.delete(pushSubscriptions).where(eq(pushSubscriptions.tenantId, tenant.id));
      await db.delete(auditEvents).where(eq(auditEvents.tenantId, tenant.id));
      await db.delete(usageEvents).where(eq(usageEvents.tenantId, tenant.id));
      await db.delete(conversionEvents).where(eq(conversionEvents.tenantId, tenant.id));
      await db.delete(creditTransactions).where(eq(creditTransactions.tenantId, tenant.id));

      if (leadIds.length > 0) {
        await db.delete(leads).where(eq(leads.tenantId, tenant.id));
      }
      if (contactIds.length > 0) {
        await db.delete(contacts).where(eq(contacts.tenantId, tenant.id));
      }
      if (accountRows.length > 0) {
        await db.delete(accounts).where(eq(accounts.tenantId, tenant.id));
      }
      const deletedCampaigns = await db
        .delete(campaigns)
        .where(eq(campaigns.tenantId, tenant.id))
        .returning({ id: campaigns.id });
      counts.campaigns = deletedCampaigns.length;

      await db.delete(orgInvites).where(eq(orgInvites.tenantId, tenant.id));
      await db.delete(sessions).where(eq(sessions.tenantId, tenant.id));

      await db
        .update(tenants)
        .set({
          onboardingStatus: "pending",
          onboardingStep: 1,
          demoMode: true,
        })
        .where(eq(tenants.id, tenant.id));

      for (const workspaceId of workspaceIds) {
        await db
          .insert(workspaceSettings)
          .values({
            workspaceId,
            enrichmentConfig: { dataMode: "free" },
            emailConfig: { sendMode: "dry_run" },
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: workspaceSettings.workspaceId,
            set: {
              enrichmentConfig: { dataMode: "free" },
              emailConfig: { sendMode: "dry_run" },
              updatedAt: new Date(),
            },
          });
      }

      await db
        .insert(creditBalances)
        .values({
          tenantId: tenant.id,
          balance: TRIAL_CREDITS,
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        })
        .onConflictDoUpdate({
          target: creditBalances.tenantId,
          set: {
            balance: TRIAL_CREDITS,
            periodStart: new Date(),
            periodEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            updatedAt: new Date(),
          },
        });
    }

    summary.push({
      email: user.email,
      slug: tenant.slug,
      tenantId: tenant.id,
      workspaceIds,
      keptLogin: true,
      dryRun: DRY_RUN,
      wiped: counts,
    });
  }

  if (!DRY_RUN) {
    invalidateEmailConfigCache();
  }

  console.log(JSON.stringify({ ok: true, dryRun: DRY_RUN, summary }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
