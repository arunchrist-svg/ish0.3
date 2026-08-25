# Scout gold-set labels

Offline precision harness. No live Apollo/Tavily.

Each JSON file is an array of cases:

```json
{
  "id": "stable-id",
  "expected": "accept" | "reject",
  "reason": "wrong_employer" | "buyer_role" | "city_corridor" | "account_rank",
  "companyName": "Scouted company",
  "person": { "name": "", "title": "", "bio": "", "location": "" },
  "companies": [{ "name": "", "city": "", "domain": "", "leadabilityBand": "high" }]
}
```

Grow toward ~50 companies / ~100 people. Weekly: `npm run eval:scout-gold`.
