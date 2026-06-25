# ISH Sales Accelerator — Automated Test Plan

Living test plan for the three-tier automated suite: **Vitest unit**, **API integration**, and **Playwright E2E**.

## Preconditions

1. **Database**: Postgres available (`DATABASE_URL` in `.env.local` or Docker: `docker compose up -d`)
2. **Migrations**: `npm run db:migrate`
3. **Test user seed**: `npm run db:seed-test-user`
4. **Dependencies**: `npm ci`

### Test credentials (deterministic)

| Field | Value |
|-------|-------|
| Email | `test@ish.local` |
| Password | `Test-ISH-2026!` |
| Draft-ready lead ID | `00000000-0000-0000-0000-000000000112` |
| Replied lead ID | `00000000-0000-0000-0000-000000000113` |

### Environment for test runs

| Variable | Value | Purpose |
|----------|-------|---------|
| `EMAIL_SEND_MODE` | `dry_run` | Never send live email in tests |
| `LLM_PROVIDER` | `gemini` | Default LLM (mocked in API agent tests) |
| `DATABASE_URL` | Postgres connection | Required for API + E2E |

---

## Run commands

```bash
npm run test:unit    # Pure logic unit tests (~89 tests)
npm run test:api     # API integration tests (~23 tests, needs DB)
npm run test:e2e     # Playwright browser tests (~13 tests, needs DB + dev server)
npm run test:all     # All tiers sequentially
npm run test:e2e:ui  # Playwright UI mode (debug)
```

---

## Test matrix

| Area | Unit | API | E2E | Status |
|------|:----:|:---:|:---:|:------:|
| Auth & permissions | AUTH-UNIT-001 | AUTH-API-001/002 | AUTH-E2E-001 | Automated |
| Pipeline / funnel | FUNNEL-UNIT-001–003 | FUNNEL-API-001 | FUNNEL-E2E-001 | Automated |
| Enrichment | ENRICH-UNIT-001–004 | — | — | Automated |
| Email | EMAIL-UNIT-001 + existing | — | EMAIL-E2E-001 | Automated |
| Agents | AGENT-UNIT-001–002 | AGENT-API-001/002 | AGENT-E2E-001 | Automated |
| Utils | UTILS-UNIT-001–002 | — | — | Automated |
| Leads | (via pipeline) | LEADS-API-001 | LEADS-E2E-001 | Automated |
| Scouting | (via enrichment) | — | SCOUT-E2E-001 | Automated |

**Total automated tests: ~125** (89 unit + 23 API + 13 E2E)

---

## Scenario catalog

### Auth & permissions

| ID | Tier | File | Description |
|----|------|------|-------------|
| AUTH-UNIT-001 | Unit | `src/lib/auth/__tests__/permissions.test.ts` | Role matrix: billing, team, settings, pipeline, read-only |
| AUTH-API-001 | API | `src/lib/auth/__tests__/session.api.test.ts` | Session create/resolve/delete round-trip |
| AUTH-API-002 | API | `src/app/api/auth/__tests__/login.api.test.ts` | Login 400/401/200 + cookie |
| AUTH-E2E-001 | E2E | `e2e/auth.spec.ts` | Login page, bad password, valid redirect |

### Pipeline / funnel

| ID | Tier | File | Description |
|----|------|------|-------------|
| FUNNEL-UNIT-001 | Unit | `src/lib/__tests__/pipeline-status.test.ts` | Status → pipeline index mapping |
| FUNNEL-UNIT-002 | Unit | `src/lib/__tests__/pipeline-status.test.ts` | Manual transitions |
| FUNNEL-UNIT-003 | Unit | `src/lib/__tests__/pipeline-status.test.ts` | Queue actions, deal amount parsing |
| FUNNEL-API-001 | API | `src/app/api/funnel/__tests__/funnel.api.test.ts` | GET funnel data, auth required |
| FUNNEL-E2E-001 | E2E | `e2e/funnel.spec.ts` | Yield Funnel page stages + API load |

### Enrichment

| ID | Tier | File | Description |
|----|------|------|-------------|
| ENRICH-UNIT-001 | Unit | `src/lib/enrichment/__tests__/validate-contact.test.ts` | Email/phone validation |
| ENRICH-UNIT-002 | Unit | `src/lib/enrichment/__tests__/validate-contact.test.ts` | Indian phone, pickBest |
| ENRICH-UNIT-003 | Unit | `src/lib/enrichment/__tests__/confidence.test.ts` | Confidence scoring & tiers |
| ENRICH-UNIT-004 | Unit | `src/lib/enrichment/__tests__/people-parser.test.ts` | LinkedIn people extraction |

### Email

| ID | Tier | File | Description |
|----|------|------|-------------|
| EMAIL-UNIT-001 | Unit | `src/lib/email/__tests__/config.test.ts` | Provider, cadence, Resend fallback |
| EMAIL-UNIT-002 | Unit | `src/lib/email/__tests__/email-sender.test.ts` | dry_run/test/live dispatch |
| EMAIL-E2E-001 | E2E | `e2e/email.spec.ts` | Settings email tab + API config |

### Agents

| ID | Tier | File | Description |
|----|------|------|-------------|
| AGENT-UNIT-001 | Unit | `src/lib/agents/__tests__/writer-scoring.test.ts` | Deliverability scoring |
| AGENT-UNIT-002 | Unit | `src/lib/agents/__tests__/writer-scoring.test.ts` | Rubric dimensions |
| AGENT-API-001 | API | `src/app/api/agents/__tests__/scout.api.test.ts` | Scout route (mocked batch) |
| AGENT-API-002 | API | `src/app/api/agents/__tests__/writer.api.test.ts` | Writer route, 402 credits |
| AGENT-E2E-001 | E2E | `e2e/agents.spec.ts` | Agents page, mocked scout run |

### Leads & scouting

| ID | Tier | File | Description |
|----|------|------|-------------|
| LEADS-API-001 | API | `src/app/api/leads/__tests__/leads.api.test.ts` | List, filter, PATCH transitions |
| LEADS-E2E-001 | E2E | `e2e/leads.spec.ts` | Lead Accelerator queue |
| SCOUT-E2E-001 | E2E | `e2e/scouting.spec.ts` | Scouting wizard city search |

### Utils

| ID | Tier | File | Description |
|----|------|------|-------------|
| UTILS-UNIT-001 | Unit | `src/lib/__tests__/utils.test.ts` | LinkedIn URL normalization |
| UTILS-UNIT-002 | Unit | `src/lib/__tests__/utils.test.ts` | Email normalization |

---

## CI pipeline

GitHub Actions workflow: [`.github/workflows/test.yml`](.github/workflows/test.yml)

Runs on push/PR to `main`/`master`:
1. Postgres 16 service container
2. `npm ci` → `db:migrate` → `db:seed-test-user`
3. Lint → unit → API → build → E2E

---



---

## Security fixes (regression coverage)

| ID | Tier | File | Description |
|----|------|------|-------------|
| AUTH-SEC-001 | API | `src/app/api/leads/__tests__/leads.api.test.ts` | Unauthenticated list/PATCH → 401 |
| AUTH-SEC-002 | API | `src/app/api/leads/__tests__/leads.api.test.ts` | Cross-tenant PATCH → 404 |
| OUTREACH-SEC-001 | API | `src/app/api/outreach/__tests__/outreach.api.test.ts` | Draft/approve without session → 401 |
| AGENT-SEC-001 | API | `src/app/api/agents/__tests__/scout.auth.api.test.ts` | Scout without session → 401 |
| SEQ-SEC-001 | API | `src/app/api/sequencer/__tests__/sequencer.api.test.ts` | Sequencer CRON_SECRET bearer auth |

### Secured routes (implementation)

| Route | Protection |
|-------|------------|
| `PATCH /api/leads/[id]` | Session + tenant isolation |
| `PATCH /api/outreach/draft` | Session + lead tenant join |
| `POST /api/outreach/approve` | Session + lead/outreach tenant check |
| `POST /api/agents/writer/reply` | Session + lead tenant check |
| `POST /api/companies/overview` | Session required |
| `POST /api/sequencer/run` | `Authorization: Bearer $CRON_SECRET` |

### Test seed safety

- `scripts/seed-test-user.ts` refuses non-local `DATABASE_URL` unless `ALLOW_TEST_SEED=true`
- Password from `TEST_USER_PASSWORD` env var (not logged)
- Set `CRON_SECRET` in Vercel before deploy or hourly cron will 401

## Manual smoke checklist (not in CI)

- [ ] Stripe webhook checkout completion
- [ ] Google OAuth sign-in
- [ ] LinkedIn OAuth + connection import
- [ ] Live email send (test mode with real SMTP)
- [ ] LLM writer output quality review

---

## External API mocking

| Tier | Strategy |
|------|----------|
| Unit | No network; pure functions only |
| API | `vi.mock()` for scout/writer agents, credits, DB where needed |
| E2E | `demoMode: true` tenant; route intercept for `/api/agents/scout/run` |
| All | `EMAIL_SEND_MODE=dry_run` |
