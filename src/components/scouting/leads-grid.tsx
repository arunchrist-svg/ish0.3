"use client";

import type { Person } from "@/lib/scouting-data";
import { LeadCard } from "./lead-card";

type Props = {
  people: Person[];
  selectedIds: Set<string>;
  primaryId: string | null;
  onToggleSelect: (id: string) => void;
  onSetPrimary: (id: string) => void;
  onContact: (person: Person) => void;
  onBookmark: (person: Person) => void;
};

export function LeadsGrid({
  people,
  selectedIds,
  primaryId,
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
          onToggleSelect={() => onToggleSelect(person.id)}
          onView={() => onSetPrimary(person.id)}
          onContact={() => onContact(person)}
          onBookmark={() => onBookmark(person)}
        />
      ))}
    </div>
  );
}
