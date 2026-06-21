Lead emails come from a **multi-stage pipeline** — discovery first, then targeted enrichment when a contact is missing an email. Nothing assumes a single source.

## End-to-end flow

```mermaid

flowchart TD

  A[Scout discovers people at company] --> B{Already has email?}

  B -->|Yes| C[Save to stakeholder / lead]

  B -->|No| D[enrichContactAccurate]

  D --> E[Free providers]

  E --> F{Still missing?}

  F -->|Yes| G[Paid provider if mode allows]

  F -->|No| H[applyVerificationGate + verifyContact]

  G --> H

  H --> I[Write to [leads.email](http://leads.email)]

  E --> J{Still missing?}

  J -->|Yes| K[AI web search fallback]

  K --> I

```

---

## 1. Initial discovery (Scout / buying committee)

When Scout finds people at a company `findPeopleAtCompany` in `buying-committee.ts`), emails can already appear from:

| Source | How email is found |

|--------|-------------------|

| **Website scrape** | Scraper service hits `/scrape/website` on the company domain |

| **AI web search** | Tavily search + Claude extracts email from snippets `discoverPeopleAtCompanies`) |

| **Web snippet fallback** | Regex email extraction from search result text `discoverPeopleFromWebSnippets`) |

| **Free enrichment search** | India directories, Google Maps, etc. via `searchContacts()` |

| **Paid search** (Apollo/Lusha mode) | Same search API, but paid provider only |

Emails found here are stored on **committee stakeholders** first, not always on leads yet.

---

## 2. Enrichment when saving Scout → Leads

On save `/api/scout/save`), if `enrichMissingContacts` is on:

1. *`batchEnrichStakeholders`** runs for stakeholders missing email/phone

2. That calls *`enrichContactAccurate`** with a free-then-paid strategy `resolveScoutEnrichmentOptions`)

3. After insert, *`enrichLeadsByIds`** can run another pass on created leads

Core logic lives in `enrichLeadRecord` `bulk-enrich-leads.ts`):

```typescript

// 1. Try free providers

let result = await enrichContactAccurate(enrichInput, freeOpts);

// 2. If still no email/phone and mode isn't "free", try paid provider

if (!hasContact && enrichmentMode !== "free") {

  result = await enrichContactAccurate(enrichInput, paidOpts);

}

// 3. AI fallback (Tavily + Claude) if still missing

if (!hasEnrichedContact(enrichedData) && useAi) {

  enrichedData = await aiEnrichLead(lead);

}

```

---

## 3. The enrichment engine `enrichContactAccurate`)

This is the main email-finding orchestrator. It walks providers in order, scores results, and picks the best email.

**Free order:**

- `website_email` → `india_directories` → `google_maps` → `linkedin`

**Full/paid order (when allowed):**

- `hunter` → `easyleads` → `prospeo` → `apollo` → `lusha` → `linkedin` → `website_email` → …

Each provider’s `enrich()` input is typically: name, title, company, city, LinkedIn URL, and resolved website domain.

### What each provider does for email

| Provider | Method |

|----------|--------|

| **website_email** | Scrapes `/contact`, `/about`, etc.; regex + `mailto:` links; falls back to scraper service |

| **hunter** | [Hunter.io](http://Hunter.io) `/email-finder` by LinkedIn handle or name + domain |

| **prospeo** | Prospeo enrich API by LinkedIn / name + company / domain |

| **apollo** | Apollo `/people/match` by email, name+company, or LinkedIn |

| **lusha** | Lusha v2/v3 person lookup |

| **easyleads** | EasyLeadz by LinkedIn URL or email |

| **india_directories** | KASSIA, CREDAI, ZaubaCorp via scraper service |

| **linkedin** | Scraper service with session cookie |

Candidates are **scored** (personal email > generic `info@`, provider trust, local verification). The best email wins via `pickBestEmail` + `mergeCandidates`.

---

## 4. Website scraping detail (most common free path)

`website_email` provider:

1. Resolve domain from `websiteUrl` or guess from company name `companyname.com`)

2. Fetch contact/about pages

3. Extract from `mailto:` links and email regex

4. If needed, call scraper service `/scrape/website`

5. Filter with `sanitizeEmail()` (blocks placeholders, image filenames, etc.)

6. Pick best with `pickBestEmail()` (prefers personal over generic company inboxes)

---

## 5. AI fallback

If providers return nothing, *`enrichPersonInfo`** runs:

1. Tavily search for the person at the company

2. Claude extracts structured JSON (email only if explicitly in results — no fabrication)

3. Same path used in manual enrich via `/api/leads/enrich`

---

## 6. Validation before storing

Before writing to `leads.email`:

1. *`applyVerificationGate`** — local checks (format, risk level)

2. *`verifyContact`** — external verification when enabled

3. *`sanitizeEmail`** — final cleanup

4. Confidence adjusted via `confidenceFromLocalContact` / `adjustConfidenceFromVerification`

---

## 7. Manual enrich on Leads page

The Leads UI “Enrich” button hits `/api/leads/enrich`, which runs the same `enrichContactAccurate` → AI fallback → verify flow as above.

---

## Summary

Lead emails are **not** from one API. The system:

1. **Discovers** them during Scout (website scrape, web search, directory search)

2. **Enriches** missing ones through a provider chain (free first, then Apollo/Lusha/EasyLeadz/Hunter/Prospeo if configured)

3. **Falls back** to AI web research

4. **Validates and sanitizes** before saving to `leads.email`

If you want, I can trace a specific path (e.g. only Scout free mode, or only the manual Enrich button) step by step with the exact API calls.