"use client";

import { useState } from "react";
import { MapPin, Pencil } from "lucide-react";
import { Button } from "@/design-system";
import { AppModal } from "@/components/ui/app-modal";
import { AreaOfInterestWizard } from "@/components/settings/area-of-interest-wizard";
import {
  DEFAULT_SCOUT_GEO,
  sanitizeScoutGeo,
  scoutGeoHasSelection,
  scoutGeoPickGroups,
  type ScoutGeoSelection,
} from "@/lib/geo/india";

type Props = {
  value?: ScoutGeoSelection | null;
  onComplete: (next: ScoutGeoSelection) => void;
};

function Chip({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-brand-black px-2 py-0.5 text-[11px] font-semibold text-white">
      {children}
    </span>
  );
}

export function AreaOfInterestSettings({ value, onComplete }: Props) {
  const [open, setOpen] = useState(false);
  const geo = sanitizeScoutGeo(value);
  const chosen = scoutGeoHasSelection(geo);
  const groups = scoutGeoPickGroups(geo);
  const wizardValue = chosen ? geo : DEFAULT_SCOUT_GEO;

  function handleComplete(next: ScoutGeoSelection) {
    onComplete(next);
    setOpen(false);
  }

  return (
    <>
      <div className="px-4 py-3">
        {chosen ? (
          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 size-4 shrink-0 text-brand-stratus-blue" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-brand-ink">Chosen regions</p>
              {groups.entireIndia ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Chip>Entire India</Chip>
                </div>
              ) : (
                <div className="mt-2 space-y-2.5">
                  {groups.regions.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {groups.regions.map((name) => (
                        <Chip key={`r-${name}`}>{name}</Chip>
                      ))}
                    </div>
                  ) : null}
                  {groups.states.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {groups.states.map((name) => (
                        <Chip key={`s-${name}`}>{name}</Chip>
                      ))}
                    </div>
                  ) : null}
                  {groups.districtGroups.map((group) => (
                    <div key={group.state}>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-brand-ink-faint">
                        {group.state}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {group.districts.map((name) => (
                          <Chip key={`${group.state}-${name}`}>{name}</Chip>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setOpen(true)}
                className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-stratus-blue"
              >
                <Pencil className="size-3" />
                Change region
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 size-4 shrink-0 text-brand-ink-faint" />
              <div>
                <p className="text-[13px] font-semibold text-brand-ink">No region chosen</p>
                <p className="mt-0.5 text-[12px] text-brand-ink-soft">
                  Pick India, states, and districts for Scout.
                </p>
              </div>
            </div>
            <Button type="button" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
              Choose Region
            </Button>
          </div>
        )}
      </div>

      <AppModal
        open={open}
        onClose={() => setOpen(false)}
        panelClassName="max-h-[min(92dvh,800px)] lg:max-w-xl"
      >
        <div className="mb-3 pr-10">
          <h3 className="text-[16px] font-bold text-brand-ink">Choose Region</h3>
          <p className="mt-0.5 text-[12px] text-brand-ink-soft">
            Map first, then districts. Scout uses only what you complete here.
          </p>
        </div>
        <AreaOfInterestWizard
          key={open ? "open" : "closed"}
          value={wizardValue}
          showHeading={false}
          className="px-0 py-0"
          onComplete={handleComplete}
        />
      </AppModal>
    </>
  );
}
