import { sql, type SQL } from "drizzle-orm";
import { leads, outreachSchedule } from "@/db";
import { INBOUND_REPLY_EMAIL_KIND } from "@/lib/email/inbound-match";
import { NON_HUMAN_INBOUND_SQL_RE } from "@/lib/email/human-reply-filter";

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

/** SQL fragment: unreplied inbound_reply row is from a human (matches outreach attention / hot rules). */
export function humanInboundScheduleRowSql(): SQL {
  return sql`coalesce(${outreachSchedule.subjectSent}, '') !~* ${NON_HUMAN_INBOUND_SQL_RE}
    and coalesce(${outreachSchedule.bodySnippet}, '') !~* ${NON_HUMAN_INBOUND_SQL_RE}
    and coalesce(${leads.lastReplyContent}, '') !~* ${NON_HUMAN_INBOUND_SQL_RE}`;
}

/** No sent human inbound_reply on this lead (excludes DSN / OOO stored as inbound_reply). */
export function noHumanInboundReplyExistsSql(): SQL {
  return sql`NOT EXISTS (
    SELECT 1 FROM ${outreachSchedule} inbound
    WHERE inbound.lead_id = ${leads.id}
      AND inbound.email_kind = ${INBOUND_REPLY_EMAIL_KIND}
      AND inbound.status = 'sent'
      AND coalesce(inbound.subject_sent, '') !~* ${NON_HUMAN_INBOUND_SQL_RE}
      AND coalesce(inbound.body_snippet, '') !~* ${NON_HUMAN_INBOUND_SQL_RE}
  )`;
}
