import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db, tenants, plans, subscriptions } from "@/db";
import { eq } from "drizzle-orm";
import { grantCredits } from "@/lib/billing/credits";

export async function POST(req: Request) {
  const key = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !webhookSecret) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 500 });
  }

  const stripe = new Stripe(key);
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (e) {
    console.error("[stripe/webhook] signature failed", e);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const tenantId = session.metadata?.tenantId;
    if (!tenantId) return NextResponse.json({ received: true });

    if (session.metadata?.type === "topup") {
      const credits = parseInt(session.metadata.credits ?? "0", 10);
      if (credits > 0) {
        await grantCredits({ tenantId, amount: credits, action: "topup", referenceId: session.id });
      }
      return NextResponse.json({ received: true });
    }

    const planSlug = session.metadata?.planSlug;
    if (planSlug) {
      const [plan] = await db.select().from(plans).where(eq(plans.slug, planSlug)).limit(1);
      if (plan) {
        await db.update(tenants).set({ plan: planSlug }).where(eq(tenants.id, tenantId));
        await db
          .insert(subscriptions)
          .values({
            tenantId,
            planId: plan.id,
            stripeSubscriptionId: (session.subscription as string) ?? null,
            status: "active",
            currentPeriodStart: new Date(),
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          })
          .onConflictDoUpdate({
            target: subscriptions.tenantId,
            set: {
              planId: plan.id,
              stripeSubscriptionId: (session.subscription as string) ?? null,
              status: "active",
              currentPeriodStart: new Date(),
              currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            },
          });
        await grantCredits({ tenantId, amount: plan.includedCredits, action: "plan.renewal", referenceId: session.id });
      }
    }
  }

  return NextResponse.json({ received: true });
}
