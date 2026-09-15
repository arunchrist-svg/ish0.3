export type SequencerRunCounts = {
  processed?: number | null;
  failed?: number | null;
  skipped?: number | null;
  pendingReview?: number | null;
};

export type SequencerRunCopy = {
  tone: "info" | "success" | "error";
  title: string;
  description: string;
};

function n(value: number | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Copy for Send due now. Zero sent is never a success scoreboard. */
export function sequencerRunCopy(result: SequencerRunCounts): SequencerRunCopy {
  const sent = n(result.processed);
  const failed = n(result.failed);
  const skipped = n(result.skipped);
  const pendingReview = n(result.pendingReview);

  if (sent === 0 && failed === 0) {
    return {
      tone: "info",
      title: "Nothing due right now",
      description:
        skipped > 0
          ? "Queued mail that looked due was held for send hours, a pause, or another send already in progress. Open a Queued card to see when it goes out."
          : "Queued emails wait for their scheduled time and your send hours. Open a Queued card to see when it sends.",
    };
  }

  const parts = [`${sent} sent`];
  if (failed) parts.push(`${failed} failed`);
  if (skipped) parts.push(`${skipped} skipped`);
  if (pendingReview) parts.push(`${pendingReview} need review`);
  const description = parts.join(" · ");

  if (sent === 0) {
    return { tone: "error", title: "Due sends did not go out", description };
  }

  return { tone: "success", title: "Due sends processed", description };
}
