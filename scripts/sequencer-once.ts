#!/usr/bin/env npx tsx
/**
 * Run the outreach sequencer once (local/dev).
 * Queued Email 1 and due follow-ups will not send without a worker (Inngest, Vercel cron, or this script).
 *
 * Usage: npm run sequencer:once
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

async function main() {
  const { runSequencer } = await import("../src/lib/agents/sequencer");
  console.log("Running sequencer…");
  const result = await runSequencer();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
