"use client";

import type { Person } from "@/lib/scouting-data";
import { PersonTile } from "@/components/cards";

type Props = {
  people: Person[];
  selectedIds: Set<string>;
  primaryId: string | null;
  onToggleSelect: (id: string) => void;
  onSetPrimary: (id: string) => void;
  selectable?: boolean;
};

export function PeopleList({
  people,
  selectedIds,
  primaryId,
  onToggleSelect,
  onSetPrimary,
  selectable = true,
}: Props) {
  return (
    <div className="flex flex-col gap-2 p-5">
      {people.map((person, i) => (
        <PersonTile
          key={person.id}
          person={person}
          index={i}
          isSelected={selectedIds.has(person.id)}
          isPrimary={primaryId === person.id}
          onCheckboxClick={(e) => {
            e.stopPropagation();
            onToggleSelect(person.id);
          }}
          onTileClick={() => onSetPrimary(person.id)}
          selectable={selectable}
        />
      ))}
    </div>
  );
}
