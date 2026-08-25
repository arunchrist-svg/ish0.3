/**
 * Full festive catalogue follow-up used once open tracking confirms
 * an earlier email was opened (likely not sitting unread in spam).
 *
 * Stored as its own editable draft (If Opened). Reply drafts already use
 * sequence position 4, so this lives at 5.
 */

export const ISH_FESTIVE_CATALOG_MARKER = "2026 gemstone collection";
/** Older catalogue drafts still count as catalogue so we do not upgrade twice. */
const ISH_FESTIVE_CATALOG_MARKER_LEGACY = "nine gifting ranges";

export const CATALOG_ON_OPEN_SEQUENCE_POSITION = 5;
export const CATALOG_ON_OPEN_VARIANT = "catalog_on_open";
export const CATALOG_ON_OPEN_EMAIL_KIND = "catalog_on_open";
export const IF_OPENED_NODE_ID = "if-opened";

export function isCatalogOnOpenDraft(row: {
  sequencePosition?: number | null;
  templateVariant?: string | null;
}): boolean {
  return (
    row.sequencePosition === CATALOG_ON_OPEN_SEQUENCE_POSITION ||
    row.templateVariant === CATALOG_ON_OPEN_VARIANT
  );
}

export function isCatalogOnOpenSchedule(row: {
  emailKind?: string | null;
  sequenceDay?: number | null;
  draftLeadOutreachId?: string | null;
}, catalogDraftId?: string | null): boolean {
  if (row.emailKind === CATALOG_ON_OPEN_EMAIL_KIND) return true;
  if (catalogDraftId && row.draftLeadOutreachId === catalogDraftId) return true;
  return false;
}

export function isIshFestiveCatalogBody(body: string | null | undefined): boolean {
  if (!body) return false;
  const lower = body.toLowerCase();
  return (
    lower.includes(ISH_FESTIVE_CATALOG_MARKER) || lower.includes(ISH_FESTIVE_CATALOG_MARKER_LEGACY)
  );
}

/**
 * Exact festive catalogue body (plain text). No em dashes.
 * Greeting and sign-off are applied by the cold-template wrapper.
 */
export function buildIshFestiveCatalogParagraphs(brand: string): string {
  return `Every festive gift carries a message. It tells your team they are valued, thanks the customers who trusted you, and honours the partners who stood by you. A gift like that deserves more than beautiful packaging. It deserves real thought.

That belief is where ${brand} began five years ago. As we grow from 56 stores in Karnataka into Telangana, targeting ₹250 Cr this year after delivering 15 lakh boxes to 1,000+ corporate partners last season, our core rule remains unchanged: what goes into every box is exactly what we serve at our own family table.

Our Non-Negotiable Standards

- Pure Farm Sourcing: 100% pure ghee, khova, and paneer straight from our own Karma Farm (which grew out of a gaushala). Never cut with dalda or cheap oil.
- Clean & Tested Recipes: Zero varak, zero chemicals, and no artificial shortcuts to extend shelf life. Every recipe is handcrafted, sensory-tested, and corporate-approved.
- Elevated Classics: Real upgrades in taste rather than shortcuts in cost, like Cranberry Dry Fruit Halwa and Chocolate Soan Papdi.
- Equal Quality for All Budgets: Our entry ₹225 Manikya box carries the exact same handcrafted quality as luxury hampers. No balushahi or filler mithai.
- Honest Packaging & Weight: Every box comes with a 100% recyclable eco-friendly bag. The weight on the box counts sweets alone, never the packaging weight.

The 2026 Gemstone Collection

- Manikya & Neelam (₹165 to ₹225): Thoughtful everyday team gifting.
- Vajra & Vaidurya: Bestselling 500g and 1kg khova and dry fruit assortments.
- Moti: Artisanal, exquisitely curated range for top clients and senior leadership.
- Kanaka: Sweets, dry fruits, and healthier jaggery or sugar-free options in travel-ready Flavours of India packaging for outstation and international shipping.
- Gomedh: Premium dry fruit trays for a lighter gift.
- Praval: Full luxury hampers combining sweets, savouries, and curated extras.
- Panna: Fresh namkeen range to complement any sweet box.
- Digital E-Coupons (₹500 / ₹1,000 / ₹1,500): Easy to distribute at scale, valid well past the festive rush across all 56 ISH stores.

We can handle end-to-end custom logo branding, selection, and pan-India delivery logistics for your team. Confirming your pre-order in advance locks in a flat minimum 10% discount.

Are you open to a quick call this week to review the 2026 catalogue and find the right fit for your budget and headcount?`;
}

/** Subject for both If Opened catalogue options. */
export function buildIshFestiveCatalogSubject(companyName: string): string {
  const company = companyName.trim() || "your team";
  return `festive gifting for ${company}`;
}

/**
 * Option B body: same catalogue, different story and standards wording.
 */
export function buildIshFestiveCatalogParagraphsB(brand: string): string {
  return `Every festive gift carries a message. It values your team, thanks trusting clients, and honours partners who stood by you. A gift like that deserves real thought, not just pretty packaging.

Five years ago, ${brand} began with one simple promise: serve only what we would put on our own family table. As we grow from a single store to 56 across Karnataka and into Telangana, scaling from ₹130 Cr to a ₹250 Cr target after delivering 15 lakh boxes to 1,000+ corporate partners last season, that rule remains untouched.

Our 5 Non-Negotiable Standards

- Farm-Direct Source: Pure ghee, khova, and paneer trace directly to our Karma Farm (grown out of a gaushala). No dalda, cheap oil, or varak.
- Corporate Office Approved: Handcrafted without recipe dilutions or preservatives. Every item is sensory-tested and majority-voted by our entire team.
- Elevated Classics: Taste upgrades over cost shortcuts, like Bombay Halwa turned to Cranberry Dry Fruit Halwa, and Soan Papdi to Chocolate Soan Papdi.
- Zero Filler Mithai: Our accessible ₹225 Manikya box carries the exact same quality as luxury hampers (no balushahi or cheap fillers).
- Honest Net Weight: Free non-woven 100% recyclable bags (250g to 1kg). Net weight counts sweets alone, never the packaging.

The 2026 Gemstone Collection

- Manikya & Neelam (₹165 to ₹225): Thoughtful everyday team gifting.
- Vajra & Vaidurya: Bestselling 500g and 1kg khova and dry fruit assortments.
- Moti: Artisanal, exquisitely curated range for senior leadership and top clients.
- Kanaka: Sweets, dry fruits, and jaggery or sugar-free options in Flavours of India packaging, built for outstation and international shipping.
- Gomedh: Premium dry fruit trays for a lighter gift.
- Praval: Full luxury hampers combining sweets, savouries, and curated extras.
- Panna: Fresh namkeen range to complement any sweet box.
- Digital E-Coupons (₹500 / ₹1,000 / ₹1,500): Easy to distribute at scale, valid well past the festive rush across all stores.

We manage custom branding, selection, and pan-India delivery logistics. Confirming your pre-order in advance secures a flat minimum 10% discount.

Are you open to a quick call this week to review the full 2026 catalogue and find the right fit for your budget and headcount?`;
}
