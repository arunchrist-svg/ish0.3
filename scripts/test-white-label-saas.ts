/**
 * Smoke-test SaaS white-label brand analysis for multiple client website URLs.
 * Usage: npx tsx scripts/test-white-label-saas.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { analyzeSellerWebsite } from "../src/lib/brand/analyze-seller-website";

const CLIENTS = [
  { label: "Stripe", url: "https://stripe.com" },
  { label: "Notion", url: "https://www.notion.com" },
  { label: "HubSpot", url: "https://www.hubspot.com" },
  { label: "Freshworks", url: "https://www.freshworks.com" },
  { label: "Zoho", url: "https://www.zoho.com" },
];

type Row = {
  label: string;
  url: string;
  ok: boolean;
  error?: string;
  brandName?: string;
  vertical?: string;
  productSummary?: string;
  toneNotes?: string;
  buyerPersonas?: string[];
  valueProposition?: string;
  differentiators?: string[];
  scoutIndustries?: string[];
  scoutDepartments?: string[];
  scoutSeniority?: string[];
  elapsedMs?: number;
};

async function main() {
  const rows: Row[] = [];

  for (const client of CLIENTS) {
    const started = Date.now();
    process.stderr.write(`Analyzing ${client.label} (${client.url})...\n`);
    try {
      const result = await analyzeSellerWebsite({
        websiteUrl: client.url,
        orgName: client.label,
      });
      const i = result.insights;
      rows.push({
        label: client.label,
        url: result.websiteUrl,
        ok: true,
        brandName: i.brandName,
        vertical: i.vertical,
        productSummary: i.productSummary,
        toneNotes: i.toneNotes,
        buyerPersonas: i.buyerPersonas,
        valueProposition: i.valueProposition,
        differentiators: i.differentiators,
        scoutIndustries: i.scoutIndustries,
        scoutDepartments: i.scoutDepartments,
        scoutSeniority: i.scoutSeniority,
        elapsedMs: Date.now() - started,
      });
      process.stderr.write(`  OK in ${Date.now() - started}ms · vertical=${i.vertical}\n`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      rows.push({
        label: client.label,
        url: client.url,
        ok: false,
        error: msg,
        elapsedMs: Date.now() - started,
      });
      process.stderr.write(`  FAIL: ${msg}\n`);
    }
  }

  console.log(JSON.stringify({ testedAt: new Date().toISOString(), results: rows }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
