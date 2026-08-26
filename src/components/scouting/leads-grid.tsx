"use client";

import { cn } from "@/lib/utils";
import type { Person } from "@/lib/scouting-data";
import { LeadCard } from "@/components/cards";

type Props = {
  people: Person[];
  selectedIds: Set<string>;
  primaryId: string | null;
  existingNames?: Set<string>;
  onToggleSelect: (id: string) => void;
  onSetPrimary: (id: string) => void;
  onContact: (person: Person) => void;
  onBookmark: (person: Person) => void;
  selectable?: boolean;
  getCompanyName?: (person: Person) => string | undefined;
  getDirectoryLeadId?: (person: Person) => string | undefined;
  compact?: boolean;
  plantCity?: string;
  onGoldVerdict?: (person: Person, verdict: "keep" | "drop") => void;
  goldBusyId?: string | null;
};

export function LeadsGrid({
  people,
  selectedIds,
  primaryId,
  existingNames,
  onToggleSelect,
  onSetPrimary,
  onContact,
  onBookmark,
  selectable = true,
  getCompanyName,
  getDirectoryLeadId,
  compact = false,
  plantCity,
  onGoldVerdict,
  goldBusyId,
}: Props) {
  return (
    <div
      className={cn(
        compact
          ? "grid grid-cols-2 gap-3 px-3 py-3"
          : "grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 lg:p-5",
      )}
    >
      {people.map((person, i) => (
        <LeadCard
          key={person.id}
          person={person}
          index={i}
          isSelected={selectedIds.has(person.id)}
          isPrimary={primaryId === person.id}
          alreadyAdded={existingNames?.has(person.name.toLowerCase()) ?? false}
          onToggleSelect={() => onToggleSelect(person.id)}
          onView={() => onSetPrimary(person.id)}
          onContact={() => onContact(person)}
          onBookmark={() => onBookmark(person)}
          selectable={selectable}
          companyName={getCompanyName?.(person)}
          directoryLeadId={getDirectoryLeadId?.(person)}
          compact={compact}
          plantCity={plantCity}
          goldBusy={goldBusyId === person.id}
          onGoldVerdict={
            onGoldVerdict && plantCity
              ? (verdict) => onGoldVerdict(person, verdict)
              : undefined
          }
        />
      ))}
    </div>
  );
}
