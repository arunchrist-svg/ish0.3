import { NextResponse } from "next/server";
import { runSequencer } from "@/lib/agents/sequencer";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runSequencer();
    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/sequencer/run]", e);
    return NextResponse.json({ error: "Sequencer failed" }, { status: 500 });
  }
}
