import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { db, notifications } from "@/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { isHumanReplyNotification } from "@/lib/email/human-reply-filter";

export async function GET() {
  try {
    const ctx = await requireTenantContext();
    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.tenantId, ctx.tenantId),
          eq(notifications.userId, ctx.userId),
          isNull(notifications.readAt),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    const unreadNotifications = rows.filter(isHumanReplyNotification);
    return NextResponse.json({
      notifications: unreadNotifications,
      unreadCount: unreadNotifications.length,
    });
  } catch (err) {
    console.error("GET /api/notifications", err);
    return NextResponse.json({ error: "Failed to load notifications" }, { status: 500 });
  }
}
