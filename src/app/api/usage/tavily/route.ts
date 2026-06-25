import { NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/tenant";
import { getTavilyUsageSnapshot } from "@/lib/enrichment/tavily-usage";
import { hasTavilyKeys } from "@/lib/enrichment/tavily-keys";
import { handleApiError } from "@/lib/api-errors";

export async function GET() {
  try {
    await requireSuperadmin();
    if (!hasTavilyKeys()) {
      return NextResponse.json({ configured: false, keyCount: 0, totalUsed: 0, totalRemaining: 0 });
    }
    const snapshot = await getTavilyUsageSnapshot();
    return NextResponse.json({ configured: true, ...snapshot });
  } catch (e) {
    return handleApiError(e, "[usage/tavily]");
  }
}
