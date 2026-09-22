import { calendarDayKey, getZonedParts } from "@/lib/email/send-window-parts";

export type HomeOutreachPeriodId =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "custom"
  | "all";

export const HOME_OUTREACH_PERIOD_OPTIONS: { id: HomeOutreachPeriodId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "this_week", label: "This week" },
  { id: "last_week", label: "Last week" },
  { id: "this_month", label: "This month" },
  { id: "custom", label: "Custom" },
  { id: "all", label: "All time" },
];

export type HomeOutreachPeriodInput = {
  period?: string | null;
  from?: string | null;
  to?: string | null;
};

export type ResolvedHomeOutreachPeriod = {
  id: HomeOutreachPeriodId;
  label: string;
  timezone: string;
  /** Inclusive UTC instant start; null = no lower bound. */
  start: Date | null;
  /** Exclusive UTC instant end; null = no upper bound. */
  end: Date | null;
  rangeLabel: string;
};

function parseDayKey(dayKey: string): { y: number; m: number; d: number } {
  const [y, m, d] = dayKey.split("-").map(Number);
  return { y, m, d };
}

function formatDayKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Calendar day +/- N (no DST issues for Asia/Kolkata). */
export function shiftDayKey(dayKey: string, deltaDays: number): string {
  const { y, m, d } = parseDayKey(dayKey);
  const t = Date.UTC(y, m - 1, d + deltaDays);
  const nd = new Date(t);
  return formatDayKey(nd.getUTCFullYear(), nd.getUTCMonth() + 1, nd.getUTCDate());
}

export function zonedDayUtcBoundsForDayKey(
  timezone: string,
  dayKey: string,
): { start: Date; end: Date; dayKey: string } {
  let lo = Date.now() - 400 * 24 * 3_600_000;
  let hi = Date.now() + 48 * 3_600_000;
  while (lo + 60_000 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const key = calendarDayKey(new Date(mid), timezone);
    if (key < dayKey) lo = mid;
    else hi = mid;
  }
  const start = new Date(hi);
  const end = new Date(start.getTime() + 24 * 3_600_000);
  return { start, end, dayKey };
}

function zonedDayUtcBounds(timezone: string, ref = new Date()): { start: Date; end: Date; dayKey: string } {
  const dayKey = calendarDayKey(ref, timezone);
  return zonedDayUtcBoundsForDayKey(timezone, dayKey);
}

function formatRangeLabel(startKey: string, endKeyInclusive: string): string {
  const fmt = (key: string) => {
    const { y, m, d } = parseDayKey(key);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: startKey.slice(0, 4) !== endKeyInclusive.slice(0, 4) ? "numeric" : undefined,
    });
  };
  if (startKey === endKeyInclusive) return fmt(startKey);
  return `${fmt(startKey)} – ${fmt(endKeyInclusive)}`;
}

function mondayStartDayKey(todayKey: string, timezone: string, ref: Date): string {
  const parts = getZonedParts(ref, timezone);
  const daysSinceMonday = (parts.weekday + 6) % 7;
  return shiftDayKey(todayKey, -daysSinceMonday);
}

function monthStartDayKey(todayKey: string): string {
  return `${todayKey.slice(0, 7)}-01`;
}

function parsePeriodId(raw?: string | null): HomeOutreachPeriodId {
  const id = (raw ?? "today").trim() as HomeOutreachPeriodId;
  if (HOME_OUTREACH_PERIOD_OPTIONS.some((o) => o.id === id)) return id;
  return "today";
}

function isValidDayKey(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function resolveHomeOutreachPeriod(
  timezone: string,
  input: HomeOutreachPeriodInput,
  now = new Date(),
): ResolvedHomeOutreachPeriod {
  const id = parsePeriodId(input.period);
  const label = HOME_OUTREACH_PERIOD_OPTIONS.find((o) => o.id === id)?.label ?? "Today";
  const todayKey = calendarDayKey(now, timezone);

  if (id === "all") {
    return {
      id,
      label,
      timezone,
      start: null,
      end: null,
      rangeLabel: "All time",
    };
  }

  if (id === "custom") {
    const fromKey = input.from?.trim() ?? "";
    const toKey = input.to?.trim() ?? "";
    if (!isValidDayKey(fromKey) || !isValidDayKey(toKey)) {
      const fallback = zonedDayUtcBounds(timezone, now);
      return {
        id: "custom",
        label,
        timezone,
        start: fallback.start,
        end: fallback.end,
        rangeLabel: formatRangeLabel(fallback.dayKey, fallback.dayKey),
      };
    }
    const startKey = fromKey <= toKey ? fromKey : toKey;
    const endKey = fromKey <= toKey ? toKey : fromKey;
    const start = zonedDayUtcBoundsForDayKey(timezone, startKey).start;
    const end = zonedDayUtcBoundsForDayKey(timezone, shiftDayKey(endKey, 1)).start;
    return {
      id: "custom",
      label,
      timezone,
      start,
      end,
      rangeLabel: formatRangeLabel(startKey, endKey),
    };
  }

  if (id === "today") {
    const b = zonedDayUtcBounds(timezone, now);
    return {
      id,
      label,
      timezone,
      start: b.start,
      end: b.end,
      rangeLabel: formatRangeLabel(b.dayKey, b.dayKey),
    };
  }

  if (id === "yesterday") {
    const yKey = shiftDayKey(todayKey, -1);
    const b = zonedDayUtcBoundsForDayKey(timezone, yKey);
    return {
      id,
      label,
      timezone,
      start: b.start,
      end: b.end,
      rangeLabel: formatRangeLabel(yKey, yKey),
    };
  }

  if (id === "this_week") {
    const startKey = mondayStartDayKey(todayKey, timezone, now);
    const start = zonedDayUtcBoundsForDayKey(timezone, startKey).start;
    const end = zonedDayUtcBounds(timezone, now).end;
    return {
      id,
      label,
      timezone,
      start,
      end,
      rangeLabel: formatRangeLabel(startKey, todayKey),
    };
  }

  if (id === "last_week") {
    const thisMonday = mondayStartDayKey(todayKey, timezone, now);
    const startKey = shiftDayKey(thisMonday, -7);
    const endKey = shiftDayKey(thisMonday, -1);
    const start = zonedDayUtcBoundsForDayKey(timezone, startKey).start;
    const end = zonedDayUtcBoundsForDayKey(timezone, shiftDayKey(endKey, 1)).start;
    return {
      id,
      label,
      timezone,
      start,
      end,
      rangeLabel: formatRangeLabel(startKey, endKey),
    };
  }

  if (id === "this_month") {
    const startKey = monthStartDayKey(todayKey);
    const start = zonedDayUtcBoundsForDayKey(timezone, startKey).start;
    const end = zonedDayUtcBounds(timezone, now).end;
    return {
      id,
      label,
      timezone,
      start,
      end,
      rangeLabel: formatRangeLabel(startKey, todayKey),
    };
  }

  const b = zonedDayUtcBounds(timezone, now);
  return {
    id: "today",
    label: "Today",
    timezone,
    start: b.start,
    end: b.end,
    rangeLabel: formatRangeLabel(b.dayKey, b.dayKey),
  };
}
