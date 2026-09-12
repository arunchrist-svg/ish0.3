import { NextResponse } from "next/server";
import { runSequencer } from "@/lib/agents/sequencer";

export const maxDuration = 300;

function authorizeCron(req: Request): boolean {
  if (req.headers.get("x-vercel-cron") === "1") return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handleSequencerCron(req: Request) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Always run. Inngest may also fire hourly; claim locking prevents double-send.
    const result = await runSequencer();
    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/sequencer/run]", e);
    return NextResponse.json({ error: "Sequencer failed" }, { status: 500 });
  }
}

/** Vercel Cron uses GET. */
export async function GET(req: Request) {
  return handleSequencerCron(req);
}

export async function POST(req: Request) {
  return handleSequencerCron(req);
}
