import { NextResponse } from "next/server";
import { getEnrichmentConfig } from "@/lib/enrichment/config";
import type { EnrichmentConfig } from "@/lib/enrichment/config";

// In-memory override — survives the process lifetime in dev
// In prod (Vercel), settings should be persisted to DB or env
let runtimeOverride: Partial<EnrichmentConfig> | null = null;

export async function GET() {
  const base = getEnrichmentConfig();
  return NextResponse.json({ ...base, ...runtimeOverride });
}

export async function POST(req: Request) {
  const body = await req.json() as Partial<EnrichmentConfig>;
  runtimeOverride = { ...runtimeOverride, ...body };

  // Push to process.env so getEnrichmentConfig() picks them up in the same process
  if (body.searchProvider) process.env.ENRICHMENT_SEARCH_PROVIDER = body.searchProvider;
  if (body.enrichProvider) process.env.ENRICHMENT_ENRICH_PROVIDER = body.enrichProvider;
  if (body.fallbackToAI !== undefined) process.env.ENRICHMENT_FALLBACK_TO_AI = String(body.fallbackToAI);
  if (body.enrichOnImport !== undefined) process.env.ENRICHMENT_ENRICH_ON_IMPORT = String(body.enrichOnImport);
  if (body.dataMode) {
    process.env.DEFAULT_DATA_MODE = body.dataMode;
    process.env.NEXT_PUBLIC_DEFAULT_DATA_MODE = body.dataMode;
  }
  if (body.scoutCompaniesLimit !== undefined) {
    process.env.SCOUT_COMPANIES_LIMIT = String(body.scoutCompaniesLimit);
  }
  if (body.scoutLeadsLimit !== undefined) {
    process.env.SCOUT_LEADS_LIMIT = String(body.scoutLeadsLimit);
  }

  return NextResponse.json({ ok: true, config: { ...getEnrichmentConfig() } });
}
