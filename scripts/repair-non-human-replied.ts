#!/usr/bin/env npx tsx
/**
 * Reclassify DSN / undelivered / OOO inbound rows that were stored as human replies.
 * Reverts lead status to outreached when no real human inbound_reply remains.
 *
 * Usage: npx tsx scripts/repair-non-human-replied.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { and, eq, sql } from "drizzle-orm";
import { db, leads, outreachSchedule } from "../src/db";
import { detectAutomatedReply } from "../src/lib/email/detect-automated-reply";
import {
  INBOUND_AUTO_REPLY_EMAIL_KIND,
  INBOUND_REPLY_EMAIL_KIND,
} from "../src/lib/email/inbound-match";
import { NON_HUMAN_INBOUND_SQL_RE } from "../src/lib/email/human-reply-filter";

async function main() {
  const badRows = await db
    .select({
      id: outreachSchedule.id,
      leadId: outreachSchedule.leadId,
      subjectSent: outreachSchedule.subjectSent,
      bodySnippet: outreachSchedule.bodySnippet,
    })
    .from(outreachSchedule)
    .where(
      and(
        eq(outreachSchedule.emailKind, INBOUND_REPLY_EMAIL_KIND),
        sql`(
          coalesce(${outreachSchedule.subjectSent}, '') ~* ${NON_HUMAN_INBOUND_SQL_RE}
          or coalesce(${outreachSchedule.bodySnippet}, '') ~* ${NON_HUMAN_INBOUND_SQL_RE}
        )`,
      ),
    );

  console.log(`Found ${badRows.length} non-human inbound_reply row(s)`);
  let reclassified = 0;
  const touchedLeads = new Set<string>();

  for (const row of badRows) {
    const detected = detectAutomatedReply({
      subject: row.subjectSent,
      text: row.bodySnippet,
    });
    await db
      .update(outreachSchedule)
      .set({
        emailKind: INBOUND_AUTO_REPLY_EMAIL_KIND,
        bounceReason: detected.reason ?? "dsn_or_auto_reclassified",
        subjectSent: row.subjectSent?.trim() || "Automated reply",
      })
      .where(eq(outreachSchedule.id, row.id));
    reclassified++;
    touchedLeads.add(row.leadId);
  }

  // Also catch replied leads whose last_reply_content is DSN but schedule subject/body was empty.
  const softBad = await db
    .select({ id: leads.id, lastReplyContent: leads.lastReplyContent })
    .from(leads)
    .where(
      and(
        eq(leads.status, "replied"),
        sql`coalesce(${leads.lastReplyContent}, '') ~* ${NON_HUMAN_INBOUND_SQL_RE}`,
      ),
    );
  for (const lead of softBad) {
    touchedLeads.add(lead.id);
    const emptyInbound = await db
      .select({ id: outreachSchedule.id })
      .from(outreachSchedule)
      .where(
        and(
          eq(outreachSchedule.leadId, lead.id),
          eq(outreachSchedule.emailKind, INBOUND_REPLY_EMAIL_KIND),
          sql`coalesce(trim(${outreachSchedule.subjectSent}), '') = ''`,
          sql`coalesce(trim(${outreachSchedule.bodySnippet}), '') = ''`,
        ),
      );
    for (const row of emptyInbound) {
      const detected = detectAutomatedReply({ text: lead.lastReplyContent });
      await db
        .update(outreachSchedule)
        .set({
          emailKind: INBOUND_AUTO_REPLY_EMAIL_KIND,
          bounceReason: detected.reason ?? "dsn_or_auto_reclassified",
          subjectSent: "Automated reply",
        })
        .where(eq(outreachSchedule.id, row.id));
      reclassified++;
    }
  }

  let reverted = 0;
  for (const leadId of touchedLeads) {
    const remainingHuman = await db
      .select({ id: outreachSchedule.id })
      .from(outreachSchedule)
      .where(
        and(
          eq(outreachSchedule.leadId, leadId),
          eq(outreachSchedule.emailKind, INBOUND_REPLY_EMAIL_KIND),
          sql`coalesce(${outreachSchedule.subjectSent}, '') !~* ${NON_HUMAN_INBOUND_SQL_RE}`,
          sql`coalesce(${outreachSchedule.bodySnippet}, '') !~* ${NON_HUMAN_INBOUND_SQL_RE}`,
        ),
      )
      .limit(1);

    if (remainingHuman.length > 0) continue;

    await db
      .update(leads)
      .set({
        status: "outreached",
        lastReplyContent: null,
        lastInboundMessageId: null,
      })
      .where(and(eq(leads.id, leadId), eq(leads.status, "replied")));
    reverted++;
  }

  console.log(JSON.stringify({ reclassified, leadsTouched: touchedLeads.size, reverted }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
