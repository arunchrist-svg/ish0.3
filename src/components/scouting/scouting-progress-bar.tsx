"use client";

import { ScoutingWizard } from "./scouting-wizard";

type Props = {
  currentStep: 1 | 2 | 3;
  companiesCount: number;
  leadsCount: number;
};

/** Dedicated progress-stage bar — wizard stepper only. */
export function ScoutingProgressBar(props: Props) {
  return <ScoutingWizard {...props} />;
}
