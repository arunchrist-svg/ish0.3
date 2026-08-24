/** Server-Timing helpers for hot API routes (Phase 0 observability). */

export type TimingMarks = Map<string, number>;

export function startTiming(): { marks: TimingMarks; t0: number } {
  return { marks: new Map(), t0: performance.now() };
}

export function mark(marks: TimingMarks, name: string, startedAt: number): void {
  marks.set(name, Math.round(performance.now() - startedAt));
}

export function serverTimingHeader(marks: TimingMarks, totalMs?: number): string {
  const parts: string[] = [];
  for (const [name, dur] of marks) {
    parts.push(`${name};dur=${dur}`);
  }
  if (totalMs != null) {
    parts.push(`total;dur=${Math.round(totalMs)}`);
  }
  return parts.join(", ");
}

export function withServerTiming(
  res: Response,
  marks: TimingMarks,
  t0: number,
): Response {
  const header = serverTimingHeader(marks, performance.now() - t0);
  res.headers.set("Server-Timing", header);
  res.headers.set("X-Response-Time", `${Math.round(performance.now() - t0)}ms`);
  return res;
}
