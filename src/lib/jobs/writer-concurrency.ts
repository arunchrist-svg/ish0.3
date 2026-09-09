/** Max parallel writer jobs per tenant (Inngest + sync fallback). Override with WRITER_JOB_CONCURRENCY. */
export function writerJobConcurrency(): number {
  const parsed = parseInt(process.env.WRITER_JOB_CONCURRENCY ?? "50", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 50;
  return Math.min(parsed, 100);
}
