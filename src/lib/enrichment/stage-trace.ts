/**
 * Per-run audit trail of every scout pipeline stage.
 *
 * `discoverCompanies` runs ~12 sequential provider and filter stages. When it returns zero
 * companies the useful question is "which stage dropped everything, and what lever fixes it?".
 * Before this module that answer required hand-instrumenting the pipeline: a 13-city Bellary
 * search returned zero with an empty warnings array because Apollo's off-city hits were
 * discarded, the directory fallback was gated off, and Places was quota-exhausted — none of
 * which surfaced.
 *
 * Structured counterpart to the `broadenStages` string trail that `discoverPeople` already
 * keeps. Cost is array pushes, so it stays on for every run.
 */

export type StageRecord = {
  stage: string;
  in: number;
  out: number;
  dropped: number;
  /** Provider error text, or why the stage dropped rows. */
  reason?: string;
  meta?: Record<string, unknown>;
};

export type StageTrace = {
  records: StageRecord[];
  /** Provider actually used, and why — data mode can silently upgrade the configured one. */
  provider?: string;
  providerReason?: string;
};

export function createStageTrace(): StageTrace {
  return { records: [] };
}

export function recordStage(
  trace: StageTrace | undefined,
  stage: string,
  inCount: number,
  outCount: number,
  reason?: string,
  meta?: Record<string, unknown>,
): void {
  if (!trace) return;
  trace.records.push({
    stage,
    in: inCount,
    out: outCount,
    dropped: Math.max(0, inCount - outCount),
    ...(reason ? { reason } : {}),
    ...(meta ? { meta } : {}),
  });
}

export function setTraceProvider(
  trace: StageTrace | undefined,
  provider: string,
  providerReason?: string,
): void {
  if (!trace) return;
  trace.provider = provider;
  if (providerReason) trace.providerReason = providerReason;
}

/**
 * The stage that emptied the pipeline: the LAST record that took rows in and let none out.
 * Later stages that saw nothing are consequences, not causes, so they are ignored.
 */
export function firstZeroingStage(trace: StageTrace | undefined): StageRecord | null {
  if (!trace?.records.length) return null;
  let found: StageRecord | null = null;
  for (const record of trace.records) {
    if (record.in > 0 && record.out === 0) found = record;
  }
  return found;
}

/** True when no provider step yielded a single row — a sourcing failure, not a filter failure. */
export function allProviderStepsEmpty(
  trace: StageTrace | undefined,
  providerStages: string[],
): boolean {
  if (!trace?.records.length) return false;
  const steps = trace.records.filter((r) => providerStages.includes(r.stage));
  if (!steps.length) return false;
  return steps.every((r) => r.out === 0);
}

/** Compact one-line funnel for logs and the UI "Why?" panel. */
export function summarizeTrace(trace: StageTrace | undefined): string {
  if (!trace?.records.length) return "";
  return trace.records.map((r) => `${r.stage}: ${r.in} -> ${r.out}`).join(" | ");
}

/**
 * Drop no-op records before persisting: stages that neither received nor produced rows carry
 * no signal and would bloat every quality event.
 */
export function compactTrace(trace: StageTrace | undefined): StageRecord[] {
  if (!trace?.records.length) return [];
  return trace.records.filter((r) => r.in > 0 || r.out > 0 || r.reason);
}
