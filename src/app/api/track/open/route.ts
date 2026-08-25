import { NextResponse } from "next/server";
import { db, outreachSchedule } from "@/db";
import { eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit";
import { scheduleCatalogOnOpenAfterOpen } from "@/lib/email/promote-catalog-on-open";
import {
  openTrackingPixelCacheHeaders,
  shouldRecordEmailOpen,
  type OpenTrackingDecision,
} from "@/lib/email/open-tracking";
import { getDefaultEmailConfig } from "@/lib/email/config";

// 43-byte 1x1 transparent GIF
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("t");

  let decision: OpenTrackingDecision | null = null;
  let sentAt: Date | null = null;
  const now = new Date();

  if (token) {
    try {
      const row = await db.query.outreachSchedule.findFirst({
        where: eq(outreachSchedule.trackingToken, token),
      });

      if (row && !row.openedAt) {
        sentAt = row.sentAt ?? null;
        decision = shouldRecordEmailOpen({
          sentAt: row.sentAt,
          status: row.status,
          now,
          userAgent: req.headers.get("user-agent"),
          referer: req.headers.get("referer"),
          appUrl: getDefaultEmailConfig().appUrl,
        });

        if (!decision.accept) {
          await logAudit({
            action: "email.open_ignored",
            entityType: "lead",
            entityId: row.leadId,
            metadata: {
              scheduleId: row.id,
              sequenceDay: row.sequenceDay,
              reason: decision.reason,
            },
          });
        } else {
          const openedAt = new Date();
          await db
            .update(outreachSchedule)
            .set({ openedAt })
            .where(eq(outreachSchedule.id, row.id));

          await logAudit({
            action: "email.opened",
            entityType: "lead",
            entityId: row.leadId,
            metadata: { scheduleId: row.id, sequenceDay: row.sequenceDay },
          });

          // Opened = prior sequence email was seen. Send If Opened instead of the next email.
          try {
            await scheduleCatalogOnOpenAfterOpen({
              leadId: row.leadId,
              openedAt,
              openedSchedule: {
                id: row.id,
                leadId: row.leadId,
                sequenceDay: row.sequenceDay,
                emailKind: row.emailKind,
                approvalId: row.approvalId,
                sendMode: row.sendMode,
                draftLeadOutreachId: row.draftLeadOutreachId,
              },
            });
          } catch (scheduleErr) {
            console.error("[track/open] if-opened schedule", scheduleErr);
          }
        }
      }
    } catch (e) {
      console.error("[track/open]", e);
    }
  }

  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      ...openTrackingPixelCacheHeaders({ decision, sentAt, now }),
    },
  });
}
