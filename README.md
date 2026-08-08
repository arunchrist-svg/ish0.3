# Nebula — multi-tenant B2B sales accelerator

Nebula is a white-label sales accelerator: scouting, enrichment, Brand Intelligence, AI outreach, and inbox. Seller brand and vertical come from workspace setup, not a hard-coded customer.

India Sweet House (sweets / Diwali gifting) ships as an optional **vertical pack** and demo seed, not as the product default.

## Stack

- Next.js 16 — App Router, RSC + client components
- React 19 + TypeScript
- Postgres + Drizzle
- Tailwind CSS v4 — tokens in `src/design-system/tokens/tokens.css`
- Inngest, Stripe, Capacitor (iOS/Android)

## Getting started

```bash
npm install
cp .env.example .env.local
npm run db:migrate   # if configured
npm run seed         # generic Demo Co tenant
# optional: npx tsx scripts/seed-packs/ish-demo.ts
npm run dev
```

Open the URL printed by `npm run dev` (often http://localhost:3002).

## Vertical packs

See `src/vertical-packs/`:

- `general` — blank B2B seller (default)
- `gifting-sweets` — sample sweets / seasonal gifting pack
- `gifting-appliances` — sample appliance rewards pack

Apply a pack from Settings → Email (brand templates) or during onboarding via website + category setup.

Original prototype: `reference/ISH_SalesAccelerator_D365.jsx`
