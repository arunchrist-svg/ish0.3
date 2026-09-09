/**
 * Repair sent rows stored as Email 1 (sequence_day 0 / email_kind initial) whose
 * approval actually linked Email 2/3 / If Opened copy.
 *
 * Does not invent a fake Email 1 send. Relabels the sent row to the real step,
 * links the draft, cancels remaining scheduled follow-ups when Email 3 already went,
 * and restores thread_root_subject from the Email 1 draft when it was saved as Re:.
 *
 * Usage:
 *   npx tsx scripts/repair-mislabeled-sequence-openers.ts --dry-run
 *   npx tsx scripts/repair-mislabeled-sequence-openers.ts
 *   npx tsx scripts/repair-mislabeled-sequence-openers.ts --lead-id=<uuid>
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq, inArray, ne } from "drizzle-orm";
import { db, leads, leadOutreach, outreachApprovals, outreachSchedule, contacts, accounts } from "../src/db";
import {
  emailLabelForDraftPosition,
  normalizeCadenceDays,
  sequenceDayForDraftPosition,
} from "../src/lib/email/cadence";
import {
  CATALOG_ON_OPEN_EMAIL_KIND,
  isCatalogOnOpenDraft,
} from "../src/lib/email/ish-festive-catalog";
import { isNonInitialSequenceDraft } from "../src/lib/email/draft-variants";

const dryRun = process.argv.includes("--dry-run");
const leadIdArg = process.argv.find((a) => a.startsWith("--lead-id="))?.slice("--lead-id=".length);

async function main() {
  const sentOpeners = await db
    .select({
      scheduleId: outreachSchedule.id,
      leadId: outreachSchedule.leadId,
      approvalId: outreachSchedule.approvalId,
      sequenceDay: outreachSchedule.sequenceDay,
      emailKind: outreachSchedule.emailKind,
      subjectSent: outreachSchedule.subjectSent,
      draftId: leadOutreach.id,
      sequencePosition: leadOutreach.sequencePosition,
      templateVariant: leadOutreach.templateVariant,
      contactName: contacts.name,
      company: accounts.name,
    })
    .from(outreachSchedule)
    .innerJoin(outreachApprovals, eq(outreachApprovals.id, outreachSchedule.approvalId))
    .innerJoin(leadOutreach, eq(leadOutreach.id, outreachApprovals.leadOutreachId))
    .innerJoin(leads, eq(leads.id, outreachSchedule.leadId))
    .innerJoin(contacts, eq(contacts.id, leads.contactId))
    .leftJoin(accounts, eq(accounts.id, leads.accountId))
    .where(
      and(
        eq(outreachSchedule.status, "sent"),
        eq(outreachSchedule.channel, "email"),
        leadIdArg ? eq(outreachSchedule.leadId, leadIdArg) : undefined,
      ),
    );

  const found = sentOpeners.filter((row) => {
    if (!(row.sequenceDay === 0 || row.emailKind === "initial")) return false;
    return isNonInitialSequenceDraft({
      sequencePosition: row.sequencePosition,
      templateVariant: row.templateVariant,
    });
  });

  console.log(`Found ${found.length} mislabeled opener row(s)${dryRun ? " (dry-run)" : ""}`);

  for (const row of found) {
    const draft = {
      sequencePosition: row.sequencePosition,
      templateVariant: row.templateVariant,
    };
    const cadence = normalizeCadenceDays([3, 7]);
    const pos = draft.sequencePosition!;
    const sequenceDay = sequenceDayForDraftPosition(pos, cadence);
    if (sequenceDay == null) {
      console.log(`skip ${row.scheduleId}: no day for position ${pos}`);
      continue;
    }
    const emailKind = isCatalogOnOpenDraft(draft) ? CATALOG_ON_OPEN_EMAIL_KIND : "followup";
    const label = emailLabelForDraftPosition(pos) ?? `position ${pos}`;

    console.log(
      `- ${row.contactName ?? row.leadId} / ${row.company ?? "?"} → relabel ${row.scheduleId} as ${label} (day ${sequenceDay}, ${emailKind})`,
    );

    if (dryRun) continue;

    await db
      .update(outreachSchedule)
      .set({
        sequenceDay,
        emailKind,
        draftLeadOutreachId: row.draftId,
      })
      .where(eq(outreachSchedule.id, row.scheduleId));

    const pending = await db
      .select()
      .from(outreachSchedule)
      .where(
        and(
          eq(outreachSchedule.leadId, row.leadId),
          eq(outreachSchedule.channel, "email"),
          inArray(outreachSchedule.status, ["scheduled", "pending_review", "paused"]),
          ne(outreachSchedule.id, row.scheduleId),
        ),
      );

    for (const sched of pending) {
      const cancelDuplicateSameDay = sched.sequenceDay === sequenceDay;
      const cancelAfterBreakup = pos === 3 && sched.sequenceDay > 0;
      if (!cancelDuplicateSameDay && !cancelAfterBreakup) continue;
      await db
        .update(outreachSchedule)
        .set({ status: "cancelled" })
        .where(eq(outreachSchedule.id, sched.id));
      console.log(`  cancelled schedule ${sched.id} (day ${sched.sequenceDay})`);
    }

    const [email1] = await db
      .select()
      .from(leadOutreach)
      .where(and(eq(leadOutreach.leadId, row.leadId), eq(leadOutreach.sequencePosition, 1)))
      .limit(1);

    const email1Subject = email1?.subjectA?.trim() || email1?.subjectB?.trim() || null;
    if (email1Subject) {
      // Store the bare Email 1 subject (no Re:). Threading adds Re: on follow-ups.
      await db
        .update(leads)
        .set({ threadRootSubject: email1Subject, updatedAt: new Date() })
        .where(eq(leads.id, row.leadId));
      console.log(`  thread_root_subject → ${email1Subject}`);
    }
  }

  console.log(dryRun ? "Dry-run complete." : "Repair complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
