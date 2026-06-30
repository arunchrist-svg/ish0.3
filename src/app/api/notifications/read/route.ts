import { NextResponse } from "next/server";
import { requireTenantContext } from "@/lib/tenant";
import { db, notifications } from "@/db";
import { eq, and, inArray } from "drizzle-orm";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : [];
    const markAll = body.all === true;

    if (markAll) {
      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(and(eq(notifications.tenantId, ctx.tenantId), eq(notifications.userId, ctx.userId)));
      return NextResponse.json({ ok: true });
    }

    if (!ids.length) return NextResponse.json({ error: "ids required" }, { status: 400 });

    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.tenantId, ctx.tenantId),
          eq(notifications.userId, ctx.userId),
          inArray(notifications.id, ids),
        ),
      );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("POST /api/notifications/read", err);
    return NextResponse.json({ error: "Failed to mark read" }, { status: 500 });
  }
}
