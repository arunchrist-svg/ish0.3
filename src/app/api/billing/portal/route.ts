import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { canManageBilling } from "@/lib/auth/permissions";
import { db, tenants } from "@/db";
import { eq } from "drizzle-orm";
import { handleApiError } from "@/lib/api-errors";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key);
}

export async function POST() {
  try {
    const ctx = await requireTenantContext();
    if (!canManageBilling(ctx.role, ctx.platformRole)) {
      throw new ForbiddenError("Only owners can manage billing");
    }

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);
    if (!tenant?.stripeCustomerId) {
      return NextResponse.json({ error: "No billing account yet. Subscribe to a plan first." }, { status: 400 });
    }

    const stripe = getStripe();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002";
    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: `${appUrl}/settings?tab=billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    return handleApiError(e, "[billing/portal]");
  }
}
