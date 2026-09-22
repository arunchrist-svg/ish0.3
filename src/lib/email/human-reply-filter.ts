import { detectAutomatedReply } from "@/lib/email/detect-automated-reply";

/**
 * Postgres regex for DSN / OOO / auto-reply copy that must not count as a human reply.
 * Keep in sync with detectAutomatedReply subject/body patterns.
 * Client-safe string only (no DB imports).
 */
export const NON_HUMAN_INBOUND_SQL_RE =
  "(undeliver(ed|able)|returned to sender|delivery status notification|mail delivery (failed|software)|could not be delivered|failure notice|out of (the )?office|automatic reply|auto[- ]?reply|auto[- ]?response|auto[- ]?generated|away from (the )?(office|desk|keyboard|work)|currently (away|unavailable)|on vacation|vacation (reply|response|message)|(maternity|paternity|parental|medical|sick|annual|sabbatical) leave|leave of absence|currently on (extended )?leave|on (extended )?leave|no longer with (the )?(company|organization|firm)|this is an? automated? (reply|response|message)|created automatically by mail delivery)";

/** Inbound schedule row looks like a real person wrote it (not DSN / OOO / auto-reply). */
export function isHumanInboundScheduleContent(row: {
  subjectSent?: string | null;
  bodySnippet?: string | null;
}): boolean {
  return !detectAutomatedReply({
    subject: row.subjectSent,
    text: row.bodySnippet,
  }).automated;
}

/** Same check for lead.lastReplyContent and optional subject. */
export function isHumanReplyContent(text?: string | null, subject?: string | null): boolean {
  if (!text?.trim() && !subject?.trim()) return false;
  return !detectAutomatedReply({ subject, text }).automated;
}

/** Filter in-app reply_received alerts that are really bounces or auto-replies. */
export function isHumanReplyNotification(row: { type?: string | null; body?: string | null }): boolean {
  if (row.type !== "reply_received") return true;
  const body = row.body ?? "";
  const quoted = body.match(/They said:\s*"([^"]*)"/i)?.[1] ?? body;
  return isHumanReplyContent(quoted);
}
