"use client";

import { cn } from "@/lib/utils";
import type { Company } from "@/lib/scouting-data";
import { CompanyTile } from "@/components/cards";

type Props = {
  companies: Company[];
  selectedIds: Set<string>;
  primaryId: string | null;
  onToggleSelect: (id: string) => void;
  onSetPrimary: (id: string) => void;
  selectable?: boolean;
  compact?: boolean;
};

export function CompaniesGrid({
  companies,
  selectedIds,
  primaryId,
  onToggleSelect,
  onSetPrimary,
  selectable = true,
  compact = false,
}: Props) {
  return (
    <div
      className={cn(
        compact
          ? "grid grid-cols-2 gap-3 px-3 py-3"
          : "grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 lg:p-5",
      )}
    >
      {companies.map((company) => (
        <CompanyTile
          key={company.id}
          company={company}
          isSelected={selectedIds.has(company.id)}
          isPrimary={primaryId === company.id}
          onToggleSelect={() => onToggleSelect(company.id)}
          onView={() => onSetPrimary(company.id)}
          selectable={selectable}
          compact={compact}
        />
      ))}
    </div>
  );
}
