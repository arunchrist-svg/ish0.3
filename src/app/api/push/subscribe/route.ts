import { NextResponse } from "next/server";
import { db, pushSubscriptions } from "@/db";
import { eq, and } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const body = await req.json();
    const { endpoint, keys } = body as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    const existing = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, ctx.userId), eq(pushSubscriptions.endpoint, endpoint)))
      .limit(1);

    if (existing.length) {
      return NextResponse.json({ ok: true, id: existing[0].id });
    }

    const [row] = await db
      .insert(pushSubscriptions)
      .values({
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      })
      .returning({ id: pushSubscriptions.id });

    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    return handleApiError(e, "[api/push/subscribe]");
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const { endpoint } = await req.json();
    if (!endpoint) return NextResponse.json({ error: "endpoint required" }, { status: 400 });
    await db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, ctx.userId), eq(pushSubscriptions.endpoint, endpoint)));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e, "[api/push/subscribe DELETE]");
  }
}
