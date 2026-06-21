"use client";

import type { Person } from "@/lib/scouting-data";
import { LeadCard } from "./lead-card";

type Props = {
  people: Person[];
  selectedIds: Set<string>;
  primaryId: string | null;
  existingNames?: Set<string>;
  onToggleSelect: (id: string) => void;
  onSetPrimary: (id: string) => void;
  onContact: (person: Person) => void;
  onBookmark: (person: Person) => void;
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
}: Props) {
  return (
    <div className="grid grid-cols-3 gap-4 p-5">
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
        />
      ))}
    </div>
  );
}
