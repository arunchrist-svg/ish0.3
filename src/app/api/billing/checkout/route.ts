import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireTenantContext, ForbiddenError } from "@/lib/tenant";
import { canManageBilling } from "@/lib/auth/permissions";
import { db, tenants, plans } from "@/db";
import { eq } from "drizzle-orm";
import { handleApiError } from "@/lib/api-errors";
import { BILLING_CURRENCY, TOP_UP_PACKS } from "@/lib/billing/plan-catalog";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key);
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    if (!canManageBilling(ctx.role, ctx.platformRole)) {
      throw new ForbiddenError("Only owners can manage billing");
    }

    const { planSlug } = (await req.json()) as { planSlug?: string };
    if (!planSlug) {
      return NextResponse.json({ error: "planSlug required" }, { status: 400 });
    }

    const stripe = getStripe();
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1);

    let customerId = tenant?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({ metadata: { tenantId: ctx.tenantId } });
      customerId = customer.id;
      await db.update(tenants).set({ stripeCustomerId: customerId }).where(eq(tenants.id, ctx.tenantId));
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3002";
    const topUp = TOP_UP_PACKS.find((pack) => pack.slug === planSlug);

    if (topUp) {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer: customerId,
        line_items: [{
          price_data: {
            currency: BILLING_CURRENCY,
            unit_amount: topUp.priceCents,
            product_data: { name: topUp.name },
          },
          quantity: 1,
        }],
        success_url: `${appUrl}/settings?tab=billing&checkout=success`,
        cancel_url: `${appUrl}/settings?tab=billing`,
        metadata: { tenantId: ctx.tenantId, type: "topup", credits: String(topUp.credits) },
      });
      return NextResponse.json({ url: session.url });
    }

    const [plan] = await db.select().from(plans).where(eq(plans.slug, planSlug)).limit(1);
    if (!plan) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        plan.stripePriceId
          ? { price: plan.stripePriceId, quantity: 1 }
          : {
              price_data: {
                currency: BILLING_CURRENCY,
                unit_amount: plan.priceCents,
                recurring: { interval: "month" },
                product_data: { name: plan.name },
              },
              quantity: 1,
            },
      ],
      success_url: `${appUrl}/settings?tab=billing&checkout=success`,
      cancel_url: `${appUrl}/settings?tab=billing`,
      metadata: { tenantId: ctx.tenantId, planSlug, type: "subscription" },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    return handleApiError(e, "[billing/checkout]");
  }
}
