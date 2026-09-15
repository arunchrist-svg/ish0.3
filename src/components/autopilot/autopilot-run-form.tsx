"use client";

import { useEffect, useMemo, useState } from "react";
import { FilterAllClear } from "@/design-system";
import { cn } from "@/lib/utils";
import {
  DEFAULT_AUTOPILOT_SCHEDULE,
  AUTOPILOT_DEFAULT_DEPARTMENTS,
  AUTOPILOT_DEFAULT_SENIORITY,
} from "@/lib/agents/autopilot-logic";
import { getOutreachTemplatesForPack } from "@/lib/email/outreach-templates";
import { SEND_TIMEZONE_OPTIONS, WEEKDAY_OPTIONS } from "@/lib/email/send-window";
import {
  scoutBootstrap,
  type AutopilotRunDto,
  type AutopilotRunWriteParams,
  type ScoutBootstrapPayload,
} from "@/lib/api-client";
import {
  scoutLocationOptions,
  type ScoutLocationOption,
  type ScoutLocationScope,
} from "@/lib/geo/india";
import type { ScoutVerticalScope } from "@/lib/scouting-data";
import {
  LocationDistrictPicker,
  ScoutIndustryFilterPanel,
  ScoutPeopleFilterPanel,
} from "@/components/scouting/scouting-toolbar";

export type AutopilotRunFormValues = AutopilotRunWriteParams;

const STEPS = ["When", "Who to find", "Template", "Send"] as const;

function toggleValue(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function locationsForScope(boot: ScoutBootstrapPayload | null, scope: ScoutLocationScope): ScoutLocationOption[] {
  if (!boot) return [];
  const focuses = boot.scoutAreasOfFocus?.length
    ? boot.scoutAreasOfFocus
    : boot.scoutAreaOfFocus
      ? [boot.scoutAreaOfFocus]
      : [];
  if (scope === "focus") {
    return boot.focusLocations ?? scoutLocationOptions(boot.scoutGeo, focuses, "focus");
  }
  return boot.interestLocations ?? boot.locations ?? scoutLocationOptions(boot.scoutGeo, focuses, "interest");
}

export function AutopilotRunForm({
  title,
  submitLabel,
  initial,
  busy,
  showRunNow = false,
  onCancel,
  onSubmit,
}: {
  title: string;
  submitLabel: string;
  initial?: AutopilotRunDto["input"] | null;
  busy?: boolean;
  showRunNow?: boolean;
  onCancel: () => void;
  onSubmit: (values: AutopilotRunFormValues) => Promise<void>;
}) {
  const templates = useMemo(
    () =>
      getOutreachTemplatesForPack("gifting-sweets").filter(
        (item) => item.id !== "follow_up" && item.id !== "final_reminder",
      ),
    [],
  );
  const schedule = initial?.schedule ?? DEFAULT_AUTOPILOT_SCHEDULE;
  const [step, setStep] = useState(0);
  const [boot, setBoot] = useState<ScoutBootstrapPayload | null>(null);
  const [cities, setCities] = useState<string[]>(initial?.cities ?? []);
  const [locationScope, setLocationScope] = useState<ScoutLocationScope>(
    initial?.locationScope === "focus" ? "focus" : "interest",
  );
  const [vertical, setVertical] = useState<ScoutVerticalScope>(
    initial?.businesses?.length && !initial.industries?.length ? "businesses" : "industries",
  );
  const [industries, setIndustries] = useState<string[]>(initial?.industries ?? []);
  const [businesses, setBusinesses] = useState<string[]>(initial?.businesses ?? []);
  const [employeeBands, setEmployeeBands] = useState<string[]>(initial?.employeeBands ?? []);
  const [seniority, setSeniority] = useState<string[]>(
    initial?.seniority ?? [...AUTOPILOT_DEFAULT_SENIORITY],
  );
  const [departments, setDepartments] = useState<string[]>(
    initial?.departments ?? [...AUTOPILOT_DEFAULT_DEPARTMENTS],
  );
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(schedule.daysOfWeek);
  const [hour, setHour] = useState(schedule.hour);
  const [minute, setMinute] = useState(schedule.minute);
  const [timezone, setTimezone] = useState(schedule.timezone);
  const [runNow, setRunNow] = useState(showRunNow);
  const [outreachTemplate, setOutreachTemplate] = useState(
    initial?.outreachTemplate ?? templates[0]?.id ?? "prasanth_sequence",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void scoutBootstrap()
      .then((data) => {
        if (cancelled) return;
        setBoot(data);
        if (!initial?.locationScope && data.scope) {
          setLocationScope(data.scope === "focus" ? "focus" : "interest");
        }
      })
      .catch(() => {
        if (!cancelled) setBoot(null);
      });
    return () => {
      cancelled = true;
    };
  }, [initial?.locationScope]);

  const locationOptions = locationsForScope(boot, locationScope);

  function values(): AutopilotRunFormValues {
    return {
      cities,
      industries: vertical === "industries" ? industries : [],
      businesses: vertical === "businesses" ? businesses : [],
      employeeBands,
      seniority,
      departments,
      locationScope,
      outreachTemplate,
      schedule: { daysOfWeek, hour, minute, timezone },
      autoSend: true,
      runNow: showRunNow ? runNow : undefined,
    };
  }

  function validateStep(index: number) {
    if (index === 0 && !daysOfWeek.length) return "Pick at least one day.";
    if (index === 1 && !cities.length) return "Pick at least one city.";
    if (index === 2 && !outreachTemplate) return "Pick a template.";
    return null;
  }

  function changeScope(scope: ScoutLocationScope) {
    setLocationScope(scope);
    setCities([]);
  }

  const fieldClass =
    "mt-1 h-9 w-full rounded-full border border-brand-stratus-blue/20 bg-white px-3 text-[13px] text-brand-ink outline-none focus:border-brand-stratus-blue/50 focus:ring-2 focus:ring-brand-stratus-blue/20";

  return (
    <form
      className="ish-scout-popover space-y-4 rounded-[20px] border border-brand-stratus-blue/15 bg-white/95 p-4 shadow-[var(--shadow-brand-sm)]"
      onSubmit={async (event) => {
        event.preventDefault();
        const message = validateStep(step) ?? (step === 3 ? validateStep(1) : null);
        if (message) {
          setError(message);
          return;
        }
        if (step < STEPS.length - 1) {
          setError(null);
          setStep((current) => current + 1);
          return;
        }
        setError(null);
        await onSubmit(values());
      }}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-stratus-blue">{title}</p>
      <div className="flex flex-wrap gap-1.5">
        {STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(index)}
            className={cn(
              "ish-scout-filter-chip",
              index === step ? "ish-scout-chip-on" : "ish-scout-chip-off",
            )}
          >
            <span className="ish-scout-filter-chip-label">
              {index + 1}. {label}
            </span>
          </button>
        ))}
      </div>

      {step === 0 ? (
        <div className="space-y-3">
          <div className="ish-scout-filter-section-head">
            <p className="ish-scout-filter-section-label">Days</p>
            <FilterAllClear
              label="Schedule days"
              allSelected={daysOfWeek.length === WEEKDAY_OPTIONS.length}
              noneSelected={daysOfWeek.length === 0}
              onAll={() => setDaysOfWeek(WEEKDAY_OPTIONS.map((day) => day.value))}
              onClear={() => setDaysOfWeek([])}
            />
          </div>
          <div className="ish-scout-chip-grid">
            {WEEKDAY_OPTIONS.map((day) => (
              <button
                key={day.value}
                type="button"
                aria-pressed={daysOfWeek.includes(day.value)}
                onClick={() =>
                  setDaysOfWeek((current) =>
                    current.includes(day.value)
                      ? current.filter((item) => item !== day.value)
                      : [...current, day.value],
                  )
                }
                className={cn(
                  "ish-scout-filter-chip",
                  daysOfWeek.includes(day.value) ? "ish-scout-chip-on" : "ish-scout-chip-off",
                )}
              >
                <span className="ish-scout-filter-chip-label">{day.short}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <label className="block">
              <span className="ish-scout-filter-section-label">Hour</span>
              <select value={hour} onChange={(event) => setHour(Number(event.target.value))} className={fieldClass}>
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {String(i).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="ish-scout-filter-section-label">Minute</span>
              <select
                value={minute}
                onChange={(event) => setMinute(Number(event.target.value))}
                className={fieldClass}
              >
                {[0, 15, 30, 45].map((value) => (
                  <option key={value} value={value}>
                    {String(value).padStart(2, "0")}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 block sm:col-span-1">
              <span className="ish-scout-filter-section-label">Timezone</span>
              <select
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                className={fieldClass}
              >
                {SEND_TIMEZONE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {showRunNow ? (
            <label className="flex items-center gap-2 text-[12.5px] font-medium text-brand-ink">
              <input
                type="checkbox"
                checked={runNow}
                onChange={(event) => setRunNow(event.target.checked)}
                className="size-4 rounded border-brand-stratus-blue/40 text-brand-stratus-blue"
              />
              Run now, then keep this schedule
            </label>
          ) : null}
        </div>
      ) : null}

      {step === 1 ? (
        <div className="space-y-4">
          <div>
            <div className="ish-scout-filter-section-head px-1">
              <p className="ish-scout-filter-section-label">Location</p>
            </div>
            <div className="mb-2 flex flex-wrap gap-1.5 px-1">
              <button
                type="button"
                onClick={() => changeScope("focus")}
                className={cn(
                  "ish-scout-filter-chip",
                  locationScope === "focus" ? "ish-scout-chip-on" : "ish-scout-chip-off",
                )}
              >
                <span className="ish-scout-filter-chip-label">Focus area</span>
              </button>
              <button
                type="button"
                onClick={() => changeScope("interest")}
                className={cn(
                  "ish-scout-filter-chip",
                  locationScope === "interest" ? "ish-scout-chip-on" : "ish-scout-chip-off",
                )}
              >
                <span className="ish-scout-filter-chip-label">Area of interest</span>
              </button>
            </div>
            <div className="overflow-hidden rounded-2xl bg-white/70 shadow-[inset_0_0_0_1px_rgba(var(--brand-stratus-blue-rgb),0.10)]">
              <LocationDistrictPicker
                cities={cities}
                onCitiesChange={setCities}
                locationOptions={locationOptions}
                locationScope={locationScope}
                compact
              />
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl bg-white/70 shadow-[inset_0_0_0_1px_rgba(var(--brand-stratus-blue-rgb),0.10)]">
            <ScoutIndustryFilterPanel
              industries={industries}
              onIndustryToggle={(name) => setIndustries(toggleValue(industries, name))}
              employeeBands={employeeBands}
              onScaleToggle={(bandId) => setEmployeeBands(toggleValue(employeeBands, bandId))}
              verticalScope={vertical}
              onVerticalScopeChange={setVertical}
              businesses={businesses}
              onBusinessToggle={(name) => setBusinesses(toggleValue(businesses, name))}
            />
          </div>
          <div className="overflow-hidden rounded-2xl bg-white/70 shadow-[inset_0_0_0_1px_rgba(var(--brand-stratus-blue-rgb),0.10)]">
            <ScoutPeopleFilterPanel
              seniority={seniority}
              departments={departments}
              verticalScope={vertical}
              onSeniorityToggle={(name) => setSeniority(toggleValue(seniority, name))}
              onDepartmentToggle={(name) => setDepartments(toggleValue(departments, name))}
            />
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <ul className="space-y-1.5">
          {templates.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                onClick={() => setOutreachTemplate(template.id)}
                className={cn(
                  "w-full rounded-2xl border px-3 py-2.5 text-left transition-colors",
                  outreachTemplate === template.id
                    ? "border-brand-stratus-blue/40 bg-brand-stratus-blue/10 ring-1 ring-brand-stratus-blue/25"
                    : "border-brand-border/55 bg-white hover:bg-brand-canvas",
                )}
              >
                <p className="text-[13px] font-semibold text-brand-ink">{template.label}</p>
                {template.description ? (
                  <p className="mt-0.5 text-[11px] text-brand-ink-soft">{template.description}</p>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {step === 3 ? (
        <div className="space-y-2 rounded-2xl bg-brand-stratus-blue/5 px-3 py-3 text-[12.5px] leading-relaxed text-brand-ink-soft">
          <p className="font-semibold text-brand-ink">Email 1 will queue automatically</p>
          <p>
            After drafts are ready, Autopilot approves Email 1 and puts it in the Outbox. Actual send
            still follows your mailbox hours, daily cap, and Outbox pause.
          </p>
          <p>Email 2 and Email 3 stay on the usual sequencer cadence after Email 1 goes out.</p>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-xl border border-brand-stratus-salmon/35 bg-brand-pink-soft/80 px-3 py-2 text-[12px] font-medium text-brand-stratus-salmon">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStep((current) => current - 1);
            }}
            className="ish-scout-ghost inline-flex h-8 items-center rounded-full px-3 text-[12px] font-semibold text-brand-ink"
          >
            Back
          </button>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="ish-scout-cta-blue inline-flex h-8 items-center rounded-full px-3 text-[12px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Saving…" : step < STEPS.length - 1 ? "Next" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="ish-scout-ghost inline-flex h-8 items-center rounded-full px-3 text-[12px] font-semibold text-brand-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
