import { NextResponse } from "next/server";
import { getTavilyUsageSnapshot } from "@/lib/enrichment/tavily-usage";
import { hasTavilyKeys } from "@/lib/enrichment/tavily-keys";

export async function GET() {
  if (!hasTavilyKeys()) {
    return NextResponse.json({
      configured: false,
      limitPerKey: 0,
      keyCount: 0,
      configuredKeyCount: 0,
      exhaustedKeyCount: 0,
      availableKeyCount: 0,
      totalLimit: 0,
      totalUsed: 0,
      totalRemaining: 0,
      sessionUsed: 0,
      percentUsed: 0,
      activeKeyId: null,
      activeKeyLabel: null,
      allKeysExhausted: false,
      configIssues: [],
      source: "tavily_account",
      keys: [],
    });
  }

  const snapshot = await getTavilyUsageSnapshot();
  return NextResponse.json({ configured: true, ...snapshot });
}
