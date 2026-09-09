import { NextResponse } from "next/server";
import { processPendingResearch } from "@/lib/agents/research-processor";

function authorizeCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handleResearchCron(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Always process. Inngest research-batch may also run; processor is safe to call repeatedly.
    const result = await processPendingResearch(10);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/research/process]", e);
    return NextResponse.json({ error: "Research processor failed" }, { status: 500 });
  }
}

/** Vercel Cron uses GET. */
export async function GET(req: Request) {
  return handleResearchCron(req);
}

export async function POST(req: Request) {
  return handleResearchCron(req);
}
