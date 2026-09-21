import { and, eq, or, sql, type SQL } from "drizzle-orm";
import { outreachSchedule } from "@/db";

/** Outbound campaign mail in Logs / open-rate. Excludes inbound replies, DSNs, and OOO. */
export function outboundCampaignEmailFilter(): SQL {
  return and(
    eq(outreachSchedule.status, "sent"),
    eq(outreachSchedule.channel, "email"),
    sql`coalesce(${outreachSchedule.emailKind}, '') not in ('inbound_reply', 'inbound_auto_reply')`,
    or(sql`${outreachSchedule.sequenceDay} >= 0`, eq(outreachSchedule.emailKind, "outbound_reply")),
  )!;
}

export { autopilotRunOutboxLabel, isOutboundCampaignLogRow } from "@/lib/email/outbound-campaign-shared";
