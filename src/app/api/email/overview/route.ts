import { NextResponse } from "next/server";
import { db, outreachSchedule, leads, contacts, accounts, leadOutreach } from "@/db";
import { eq, and, isNotNull, sql } from "drizzle-orm";

export type LeadEmailRow = {
  leadId: string;
  contactName: string;
  contactEmail: string | null;
  companyName: string;
  industry: string | null;
  city: string | null;
  emailsSent: number;
  lastEmailDay: number;
  nextEmailDay: number | null;
  nextEmailDue: string | null;
  openedAt: string | null;
  status: "active" | "hot" | "replied" | "stopped" | "draft_ready";
  leadStatus: string;
  hasDraftReady: boolean;
};

export async function GET() {
  try {
    // Fetch all outreach schedule rows with lead/contact/account info
    const rows = await db
      .select({
        scheduleId: outreachSchedule.id,
        leadId: outreachSchedule.leadId,
        sequenceDay: outreachSchedule.sequenceDay,
        scheduleStatus: outreachSchedule.status,
        scheduledFor: outreachSchedule.scheduledFor,
        sentAt: outreachSchedule.sentAt,
        openedAt: outreachSchedule.openedAt,
        leadStatus: leads.status,
        contactName: contacts.name,
        contactEmail: contacts.email,
        companyName: accounts.name,
        industry: accounts.industry,
        city: accounts.city,
      })
      .from(outreachSchedule)
      .innerJoin(leads, eq(outreachSchedule.leadId, leads.id))
      .innerJoin(contacts, eq(leads.contactId, contacts.id))
      .innerJoin(accounts, eq(leads.accountId, accounts.id));

    // Check for reply drafts ready
    const replyDrafts = await db
      .select({ leadId: leadOutreach.leadId })
      .from(leadOutreach)
      .where(eq(leadOutreach.templateVariant, "reply"));

    const replyDraftLeadIds = new Set(replyDrafts.map((r) => r.leadId));

    // Group rows by leadId
    const byLead = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!byLead.has(row.leadId)) byLead.set(row.leadId, []);
      byLead.get(row.leadId)!.push(row);
    }

    const result: LeadEmailRow[] = [];

    for (const [leadId, leadRows] of byLead) {
      const first = leadRows[0];
      const sentRows = leadRows.filter((r) => r.scheduleStatus === "sent");
      const scheduledRows = leadRows.filter((r) => r.scheduleStatus === "scheduled");
      const allOpens = leadRows.filter((r) => r.openedAt != null);
      const lastOpenedAt = allOpens.length > 0
        ? allOpens.sort((a, b) => new Date(b.openedAt!).getTime() - new Date(a.openedAt!).getTime())[0].openedAt
        : null;

      const nextScheduled = scheduledRows.sort(
        (a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime(),
      )[0];

      const maxSentDay = sentRows.length > 0 ? Math.max(...sentRows.map((r) => r.sequenceDay)) : -1;
      const hasDraftReady = replyDraftLeadIds.has(leadId);

      let status: LeadEmailRow["status"] = "active";
      if (first.leadStatus === "replied") {
        status = hasDraftReady ? "draft_ready" : "replied";
      } else if (allOpens.length > 0 && scheduledRows.length > 0) {
        status = "hot";
      } else if (allOpens.length > 0 && scheduledRows.length === 0) {
        status = "hot";
      } else if (scheduledRows.length === 0 && sentRows.length > 0) {
        status = "stopped";
      } else {
        status = "active";
      }

      result.push({
        leadId,
        contactName: first.contactName,
        contactEmail: first.contactEmail,
        companyName: first.companyName,
        industry: first.industry,
        city: first.city,
        emailsSent: sentRows.length,
        lastEmailDay: maxSentDay,
        nextEmailDay: nextScheduled?.sequenceDay ?? null,
        nextEmailDue: nextScheduled ? new Date(nextScheduled.scheduledFor).toISOString() : null,
        openedAt: lastOpenedAt ? new Date(lastOpenedAt).toISOString() : null,
        status,
        leadStatus: first.leadStatus,
        hasDraftReady,
      });
    }

    // Stats
    const allLeads = result;
    const totalSent = allLeads.reduce((s, r) => s + r.emailsSent, 0);
    const opened = allLeads.filter((r) => r.openedAt != null).length;
    const replied = allLeads.filter((r) => r.leadStatus === "replied").length;
    const dueToday = allLeads.filter((r) => {
      if (!r.nextEmailDue) return false;
      const due = new Date(r.nextEmailDue);
      const now = new Date();
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return due <= todayEnd;
    }).length;

    const hot = result.filter((r) => r.status === "hot");
    const active = result.filter((r) => r.status === "active");
    const draftReady = result.filter((r) => r.status === "draft_ready");
    const stopped = result.filter((r) => r.status === "stopped" || r.status === "replied");

    return NextResponse.json({
      stats: { totalSent, opened, replied, dueToday, total: allLeads.length },
      hot,
      active,
      draftReady,
      stopped,
    });
  } catch (e) {
    console.error("[api/email/overview]", e);
    return NextResponse.json({ error: "Failed to load email overview" }, { status: 500 });
  }
}
