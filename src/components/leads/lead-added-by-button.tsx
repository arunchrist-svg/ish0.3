"use client";

import { cn } from "@/lib/utils";

export function addedByCaption(opts: {
  name?: string | null;
  leadSource?: string | null;
}): string {
  const name = opts.name?.trim();
  if (name) return `Added by ${name}`;

  switch (opts.leadSource) {
    case "csv_import":
      return "Added by Excel import";
    case "scout":
    case "scout_wizard":
      return "Added by Scout";
    case "manual":
      return "Added manually";
    case "linkedin":
    case "linkedin_import":
      return "Added from LinkedIn";
    default:
      return "Added by team";
  }
}

type Props = {
  name?: string | null;
  leadSource?: string | null;
  className?: string;
};

export function LeadAddedByLabel({ name, leadSource, className }: Props) {
  return (
    <p
      className={cn(
        "max-w-[7.5rem] text-right text-[9.5px] font-medium leading-snug text-brand-ink-faint",
        className,
      )}
      title={addedByCaption({ name, leadSource })}
    >
      {addedByCaption({ name, leadSource })}
    </p>
  );
}
