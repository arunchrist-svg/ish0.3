import { NextResponse } from "next/server";
import { db, outreachSchedule } from "@/db";
import { eq } from "drizzle-orm";
import { logAudit } from "@/lib/audit";

// 43-byte 1x1 transparent GIF
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("t");

  if (token) {
    try {
      const row = await db.query.outreachSchedule.findFirst({
        where: eq(outreachSchedule.trackingToken, token),
      });

      if (row && !row.openedAt) {
        await db
          .update(outreachSchedule)
          .set({ openedAt: new Date() })
          .where(eq(outreachSchedule.id, row.id));

        await logAudit({
          action: "email.opened",
          entityType: "lead",
          entityId: row.leadId,
          metadata: { scheduleId: row.id, sequenceDay: row.sequenceDay },
        });
      }
    } catch (e) {
      console.error("[track/open]", e);
    }
  }

  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Pragma": "no-cache",
    },
  });
}
