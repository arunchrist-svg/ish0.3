"use client";

import type { Person } from "@/lib/scouting-data";
import { PersonTile } from "@/components/cards";
import { cn } from "@/lib/utils";

type Props = {
  people: Person[];
  selectedIds: Set<string>;
  primaryId: string | null;
  onToggleSelect: (id: string) => void;
  onSetPrimary: (id: string) => void;
  selectable?: boolean;
  /** Narrow rail layout (Accounts detail). */
  compact?: boolean;
  className?: string;
};

export function PeopleList({
  people,
  selectedIds,
  primaryId,
  onToggleSelect,
  onSetPrimary,
  selectable = true,
  compact = false,
  className,
}: Props) {
  return (
    <div className={cn("flex flex-col", compact ? "gap-2.5 p-0" : "gap-2 p-5", className)}>
      {people.map((person, i) => (
        <PersonTile
          key={person.id}
          person={person}
          index={i}
          isSelected={selectedIds.has(person.id)}
          isPrimary={primaryId === person.id}
          compact={compact}
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
