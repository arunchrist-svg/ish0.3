import { NextResponse } from "next/server";
import { runSequencer } from "@/lib/agents/sequencer";

export async function POST() {
  try {
    const result = await runSequencer();
    return NextResponse.json(result);
  } catch (e) {
    console.error("[api/sequencer/run]", e);
    return NextResponse.json({ error: "Sequencer failed" }, { status: 500 });
  }
}
