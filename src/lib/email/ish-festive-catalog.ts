/**
 * Full festive catalogue follow-up used once open tracking confirms
 * an earlier email was opened (likely not sitting unread in spam).
 */

export const ISH_FESTIVE_CATALOG_MARKER = "nine gifting ranges";

export function isIshFestiveCatalogBody(body: string | null | undefined): boolean {
  return Boolean(body && body.toLowerCase().includes(ISH_FESTIVE_CATALOG_MARKER));
}

/** Exact user catalogue copy (em dashes normalized to commas / hyphens). */
export function buildIshFestiveCatalogParagraphs(brand: string): string {
  return `Every festive gift carries a message, it tells your people they are valued, thanks the customers who trusted you, and honours the partners who stood by you through the year. We believe a gift like that deserves more than beautiful packaging. It deserves thought.

That belief is where ${brand} began, and five years later, it's still where we start. From a single store to 56 across Karnataka and very soon Telangana, from ₹130 Cr last year to a ₹250 Cr target this year, from 1,000+ corporate partners last festive season to 15 lakh boxes delivered, the number that matters most to us hasn't changed: what goes into every box is exactly what we'd serve at our own family table.

A few things we've never compromised on, festive season after festive season:

- Only pure ghee, never cut with dalda or oil. We're one of the very few sweet brands with our own dairy: Karma Farm, which grew out of a gaushala; so the ghee, khova and paneer in your box trace back to a source we know personally.
- We don't use varak and don't dilute recipes to cut cost or extend shelf life. Every sweet is handcrafted, and every recipe is sensory-tested and approved by our entire corporate office before it earns a place in store; only the cut the majority votes for makes it to your box.
- Our classics have been quietly elevated, not simplified: Bombay Halwa became Cranberry Dry Fruit Halwa, plain Soan Papdi became Chocolate Soan Papdi. Upgrades in taste, never shortcuts in cost.
- Even our most accessible box, the ₹225 Manikya, carries the same handcrafted quality as our premium range - no balushahi, no filler mithai. We don't believe a smaller budget should mean a smaller experience, which is rare to find in this industry.
- Every box, from 250g to 1kg comes with a non-woven, eco-friendly 100% recyclable bag, and the grammage you see on the box is sweets alone; we never count the box's own weight toward what you're paying for.

This year's collection is built around nine gifting ranges, each named for a gemstone and designed with a different kind of relationship in mind:

- Manikya & Neelam: thoughtful everyday gifting, starting at ₹165–₹225
- Vajra & Vaidurya: our bestselling 500g and 1kg khova and dry-fruit assortments
- Moti: an artisanal, exquisitely curated range for your most valued clients or senior leadership
- Kanaka: dry fruits, sweets and healthier jaggery/sugar-free options in one box, and travels well for outstation and international shipping thanks to its Flavours of India packaging
- Gomedh: premium dry fruit trays for a cleaner, lighter gift
- Praval: full luxury hampers combining sweets, savouries and curated extras
- Panna: our namkeen range, the perfect companion to any sweet box

And if you'd rather let your people choose for themselves, our e-gift coupons (₹500 / ₹1,000 / ₹1,500) are redeemable at any ISH store, easier to distribute at scale, and valid well past the festive rush.

We'd love to put together a custom selection for your team this Dusshera and Diwali: customisation, branding and pan-India delivery planning are all things we can work through together.

And as a thank you to partners who plan ahead with us: pre-order and confirm your requirement in advance, and you get a flat minimum 10% off your order.

Happy to set up a quick call this week to walk you through the full 2026 catalogue and find the right fit for your budget and headcount.`;
}
