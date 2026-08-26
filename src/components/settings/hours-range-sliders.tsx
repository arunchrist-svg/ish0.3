"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  MAX_SEND_HOUR,
  MAX_SEND_HOUR_RANGES,
  MIN_SEND_HOUR,
  formatHourAxisLabel,
  formatHourLabel,
  normalizeSendHourRanges,
  snapToHalfHour,
  suggestNextHourRange,
  type SendHourRange,
} from "@/lib/email/send-window";
import { Plus, X } from "lucide-react";

/** Thumb / range bounds: 6:00 AM inclusive through 8:00 PM exclusive. */
const MIN_HOUR = MIN_SEND_HOUR;
const MAX_HOUR = MAX_SEND_HOUR;
/** Track spans only the allowed send window (not midnight–midnight). */
const TRACK_SPAN = MAX_HOUR - MIN_HOUR;
const STEP = 0.5;
const MIN_SPAN = 0.5;
/** When thumbs are closer than this % of the track, floating pills would overlap. */
const PILL_COLLISION_PCT = 14;

/** Axis labels every 2 hours across the allowed window. */
const AXIS_LABEL_HOURS = [6, 8, 10, 12, 14, 16, 18, 20] as const;

type ActiveThumb = "start" | "end" | null;

/** Map a local hour onto the allowed-window track (6–20 → 0–100%). */
export function hourToTrackPct(
  hour: number,
  minHour: number = MIN_HOUR,
  maxHour: number = MAX_HOUR,
): number {
  if (!Number.isFinite(hour)) return 0;
  const span = maxHour - minHour;
  if (span <= 0) return 0;
  return ((hour - minHour) / span) * 100;
}

function clampRange(
  next: SendHourRange,
  index: number,
  ranges: SendHourRange[],
): SendHourRange {
  const prevEnd = index > 0 ? ranges[index - 1]!.hourEnd : MIN_HOUR;
  const nextStart = index < ranges.length - 1 ? ranges[index + 1]!.hourStart : MAX_HOUR;
  let start = Math.max(prevEnd, Math.min(MAX_HOUR - MIN_SPAN, snapToHalfHour(next.hourStart)));
  let end = Math.max(start + MIN_SPAN, Math.min(nextStart, snapToHalfHour(next.hourEnd)));
  if (end <= start) end = Math.min(nextStart, start + MIN_SPAN);
  if (end <= start) {
    start = Math.max(prevEnd, end - MIN_SPAN);
  }
  start = Math.max(MIN_HOUR, Math.min(MAX_HOUR - MIN_SPAN, start));
  end = Math.max(start + MIN_SPAN, Math.min(MAX_HOUR, end));
  return { hourStart: start, hourEnd: end };
}

function ThumbTooltip({ hour, leftPct }: { hour: number; leftPct: number }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute z-10 whitespace-nowrap rounded-full border border-brand-stratus-blue/25 bg-white px-2 py-0.5 text-[10px] font-semibold tabular-nums text-brand-stratus-blue shadow-[var(--shadow-brand-sm)]"
      style={{
        left: `${leftPct}%`,
        top: 0,
        transform: "translate(-50%, calc(-100% - 4px))",
      }}
    >
      {formatHourLabel(hour)}
    </span>
  );
}

function HourRangeSlider({
  range,
  onChange,
  onRemove,
  canRemove,
  label,
}: {
  range: SendHourRange;
  onChange: (next: SendHourRange) => void;
  onRemove: () => void;
  canRemove: boolean;
  label: string;
}) {
  const [activeThumb, setActiveThumb] = useState<ActiveThumb>(null);
  const startPct = hourToTrackPct(range.hourStart);
  const endPct = hourToTrackPct(range.hourEnd);
  const interacting = activeThumb != null;
  const pillsCollide = endPct - startPct < PILL_COLLISION_PCT;
  const tickCount = Math.round(TRACK_SPAN / STEP) + 1;

  useEffect(() => {
    if (!interacting) return;
    const clear = () => setActiveThumb(null);
    window.addEventListener("pointerup", clear);
    window.addEventListener("pointercancel", clear);
    return () => {
      window.removeEventListener("pointerup", clear);
      window.removeEventListener("pointercancel", clear);
    };
  }, [interacting]);

  return (
    <div className="rounded-2xl border border-brand-stratus-blue/20 bg-white/80 px-3 py-2.5 shadow-[var(--shadow-brand-sm)]">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[11px] font-semibold text-brand-ink">{label}</span>
          <p
            className={cn(
              "text-[12px] font-medium tabular-nums text-brand-ink-soft",
              interacting && "invisible",
            )}
            aria-hidden={interacting}
          >
            {formatHourLabel(range.hourStart)} – {formatHourLabel(range.hourEnd)}
          </p>
        </div>
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${label}`}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-brand-ink-faint transition-colors hover:bg-brand-pink-soft hover:text-brand-stratus-salmon"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      <div className="relative h-8 select-none">
        {interacting ? (
          pillsCollide ? (
            <ThumbTooltip
              hour={activeThumb === "end" ? range.hourEnd : range.hourStart}
              leftPct={activeThumb === "end" ? endPct : startPct}
            />
          ) : (
            <>
              <ThumbTooltip hour={range.hourStart} leftPct={startPct} />
              <ThumbTooltip hour={range.hourEnd} leftPct={endPct} />
            </>
          )
        ) : null}
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-brand-stratus-blue/12" />
        <div
          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-brand-stratus-blue"
          style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
        />
        {/*
          Native range thumbs sit at (value - min) / (max - min).
          min/max are the hard send-window bounds so thumbs cannot leave 6:00–8:00 PM.
        */}
        <input
          type="range"
          min={MIN_HOUR}
          max={MAX_HOUR}
          step={STEP}
          value={range.hourStart}
          aria-label={`${label} start`}
          aria-valuemin={MIN_HOUR}
          aria-valuemax={MAX_HOUR - MIN_SPAN}
          onPointerDown={() => setActiveThumb("start")}
          onPointerUp={() => setActiveThumb(null)}
          onPointerCancel={() => setActiveThumb(null)}
          onFocus={() => setActiveThumb("start")}
          onBlur={() => setActiveThumb(null)}
          onChange={(e) => {
            setActiveThumb("start");
            const hourStart = Math.max(
              MIN_HOUR,
              Math.min(MAX_HOUR - MIN_SPAN, snapToHalfHour(Number(e.target.value))),
            );
            onChange({
              hourStart,
              hourEnd: Math.max(hourStart + MIN_SPAN, Math.min(MAX_HOUR, range.hourEnd)),
            });
          }}
          className="ish-hours-range-thumb absolute inset-0 z-[2] w-full appearance-none bg-transparent"
        />
        <input
          type="range"
          min={MIN_HOUR}
          max={MAX_HOUR}
          step={STEP}
          value={range.hourEnd}
          aria-label={`${label} end`}
          aria-valuemin={MIN_HOUR + MIN_SPAN}
          aria-valuemax={MAX_HOUR}
          onPointerDown={() => setActiveThumb("end")}
          onPointerUp={() => setActiveThumb(null)}
          onPointerCancel={() => setActiveThumb(null)}
          onFocus={() => setActiveThumb("end")}
          onBlur={() => setActiveThumb(null)}
          onChange={(e) => {
            setActiveThumb("end");
            const hourEnd = Math.max(
              MIN_HOUR + MIN_SPAN,
              Math.min(MAX_HOUR, snapToHalfHour(Number(e.target.value))),
            );
            onChange({
              hourStart: Math.max(MIN_HOUR, Math.min(range.hourStart, hourEnd - MIN_SPAN)),
              hourEnd,
            });
          }}
          className="ish-hours-range-thumb absolute inset-0 z-[3] w-full appearance-none bg-transparent"
        />
      </div>

      {/* Tick marks: long = hour, short = :30 (allowed window only) */}
      <div className="relative mt-1.5 h-2.5" aria-hidden>
        {Array.from({ length: tickCount }, (_, i) => {
          const hour = MIN_HOUR + i * STEP;
          const isHour = hour % 1 === 0;
          return (
            <span
              key={hour}
              className={cn(
                "absolute top-0 w-px -translate-x-1/2 bg-brand-stratus-blue/35",
                isHour ? "h-2.5" : "h-1.5 bg-brand-stratus-blue/22",
              )}
              style={{ left: `${hourToTrackPct(hour)}%` }}
            />
          );
        })}
      </div>

      <div className="relative mt-0.5 h-3">
        {AXIS_LABEL_HOURS.map((hour) => (
          <span
            key={hour}
            className="absolute text-[9px] font-medium tabular-nums text-brand-ink-faint"
            style={{
              left: `${hourToTrackPct(hour)}%`,
              transform:
                hour === MIN_HOUR
                  ? undefined
                  : hour === MAX_HOUR
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
            }}
          >
            {formatHourAxisLabel(hour)}
          </span>
        ))}
      </div>
    </div>
  );
}

export function HoursRangeSliders({
  ranges,
  onChange,
}: {
  ranges: SendHourRange[];
  onChange: (ranges: SendHourRange[]) => void;
}) {
  const normalized = normalizeSendHourRanges(ranges);
  const nextSuggestion = suggestNextHourRange(normalized);

  function updateAt(index: number, next: SendHourRange) {
    const draft = normalized.map((r, i) => (i === index ? next : r));
    draft[index] = clampRange(next, index, draft);
    onChange(normalizeSendHourRanges(draft));
  }

  function removeAt(index: number) {
    if (normalized.length <= 1) return;
    onChange(normalizeSendHourRanges(normalized.filter((_, i) => i !== index)));
  }

  function addRange() {
    if (!nextSuggestion) return;
    onChange(normalizeSendHourRanges([...normalized, nextSuggestion]));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-brand-ink-soft">Hours</span>
        <button
          type="button"
          onClick={addRange}
          disabled={!nextSuggestion}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-brand-stratus-blue/25 bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-brand-stratus-blue transition-colors",
            "hover:bg-brand-stratus-blue/10 disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          <Plus className="size-3" />
          Add
        </button>
      </div>

      <div className="space-y-2">
        {normalized.map((range, index) => (
          <HourRangeSlider
            key={index}
            range={range}
            label={normalized.length === 1 ? "Send window" : `Block ${index + 1}`}
            canRemove={normalized.length > 1}
            onRemove={() => removeAt(index)}
            onChange={(next) => updateAt(index, next)}
          />
        ))}
      </div>

      <p className="text-[10px] leading-snug text-brand-ink-faint">
        Sliders stop at 6:00 AM and 8:00 PM. No sends before or after that window. Add another block
        for split days (e.g. 8–14 and 16–20). Max {MAX_SEND_HOUR_RANGES} blocks.
      </p>
    </div>
  );
}
