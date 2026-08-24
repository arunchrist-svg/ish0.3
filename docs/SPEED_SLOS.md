# Speed SLOs (1k companies / 1k leads)

Product budgets for warm production after the scale + full-stack speed program.

## Budgets

| Budget | Target |
| --- | --- |
| Hub interactive (warm) | under 1s |
| List API p95 at 1k rows, page size 50 | under 200ms |
| Lead detail p95 (core fields) | under 400ms warm |
| Idle auth-heavy polls per user | under 1 request / 2 minutes |
| List JSON | thin rows only (no overview / thread bodies) |

## Hot routes (Server-Timing)

Instrument and review weekly:

- `GET /api/auth/me`
- `GET /api/hub/badge`
- `GET /api/leads`
- `GET /api/leads/[id]`
- `GET /api/directory`
- `GET /api/email/overview`
- `GET /api/scout/bootstrap`

Look for `Server-Timing` and `X-Response-Time` response headers (`auth`, `db`, `total`).

## Weekly review checklist

1. Vercel Observability: p50/p95 for the routes above
2. Neon: slow queries and connection count under concurrent tabs
3. Idle poll QPS per active user (badge + agent runs)
4. List payload bytes at page size 50
5. Cold-start rate after deploys

## Architecture rules

- Default list page size 50, max 100 (never import max 5000)
- Cursor pagination on list surfaces
- Virtualize scroll surfaces that can exceed ~50 rows
- Scout discovery is session-scoped; CRM lists are paginated DB truth
- Heavy scout / writer / enrich work goes through Inngest when configured
