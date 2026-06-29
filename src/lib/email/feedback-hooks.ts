/**
 * Feedback-loop hooks for recalibrating content rules and sender health over time.
 *
 * v1 stores audit events only. Future work:
 * - Aggregate reply/open/bounce rates by subject skeleton + sending domain
 * - Nightly job to adjust rule deltas from outcomes
 * - Resend email.bounced webhook for async invalidation of permutation test candidates
 * - Optional seed-account placement tests (GlockApps / Mailgun)
 *
 * Event types:
 * - content.scored — draft scored at write/revise time (ruleHits + contentScore)
 * - outreach.sent — includes contentScore + ruleIds for outcome correlation
 * - outreach.preflight_override — sender health bypassed on live send
 */

import { logAudit } from "@/lib/audit";
import type { ContentRuleHit } from "@/lib/email/content-rules";

export async function auditContentScored(params: {
  tenantId: string;
  workspaceId: string;
  leadId: string;
  leadOutreachId: string;
  contentScore: number;
  ruleHits: ContentRuleHit[];
  sequencePosition?: number;
}): Promise<void> {
  await logAudit({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    action: "content.scored",
    entityType: "lead_outreach",
    entityId: params.leadOutreachId,
    metadata: {
      leadId: params.leadId,
      contentScore: params.contentScore,
      ruleIds: params.ruleHits.map((h) => h.id),
      ruleHits: params.ruleHits,
      sequencePosition: params.sequencePosition ?? 1,
    },
  });
}

export async function auditOutreachSentContent(params: {
  tenantId: string;
  workspaceId: string;
  leadId: string;
  approvalId: string;
  contentScore?: number | null;
  ruleIds?: string[];
  subject?: string;
  sendMode?: string;
}): Promise<void> {
  await logAudit({
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    action: "outreach.sent",
    entityType: "lead",
    entityId: params.leadId,
    metadata: {
      approvalId: params.approvalId,
      contentScore: params.contentScore ?? null,
      contentRuleIds: params.ruleIds ?? [],
      subject: params.subject,
      sendMode: params.sendMode,
      // Hooks for v2: openedAt, repliedAt, bouncedAt correlated in analytics job
    },
  });
}
