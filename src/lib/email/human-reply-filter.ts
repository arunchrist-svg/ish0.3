import { sql, type SQL } from "drizzle-orm";
import { leads, outreachSchedule } from "@/db";
import { INBOUND_REPLY_EMAIL_KIND } from "@/lib/email/inbound-match";

/**
 * Postgres regex for DSN / OOO / auto-reply copy that must not count as a human reply.
 * Keep in sync with detectAutomatedReply subject/body patterns.
 */
export const NON_HUMAN_INBOUND_SQL_RE =
  "(undeliver(ed|able)|returned to sender|delivery status notification|mail delivery (failed|software)|could not be delivered|failure notice|out of (the )?office|automatic reply|auto[- ]?reply|auto[- ]?response|auto[- ]?generated|away from (the )?(office|desk|keyboard|work)|currently (away|unavailable)|on vacation|vacation (reply|response|message)|(maternity|paternity|parental|medical|sick|annual|sabbatical) leave|leave of absence|currently on (extended )?leave|on (extended )?leave|no longer with (the )?(company|organization|firm)|this is an? automated? (reply|response|message)|created automatically by mail delivery)";

/** Lead has at least one inbound_reply that does not look like DSN / OOO / auto-reply. */
export function hasHumanInboundReplySql(): SQL {
  return sql`exists (
    select 1
    from ${outreachSchedule} s
    where s.lead_id = ${leads.id}
      and s.email_kind = ${INBOUND_REPLY_EMAIL_KIND}
      and coalesce(s.subject_sent, '') !~* ${NON_HUMAN_INBOUND_SQL_RE}
      and coalesce(s.body_snippet, '') !~* ${NON_HUMAN_INBOUND_SQL_RE}
  )`;
}

/** True when last_reply_content looks like DSN / OOO / auto (defense in depth). */
export function lastReplyLooksNonHumanSql(): SQL {
  return sql`coalesce(${leads.lastReplyContent}, '') ~* ${NON_HUMAN_INBOUND_SQL_RE}`;
}

export function humanRepliedLeadSql(): SQL {
  return sql`${hasHumanInboundReplySql()} and not (${lastReplyLooksNonHumanSql()})`;
}
