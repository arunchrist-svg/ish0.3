"use client";

import type { Company } from "@/lib/scouting-data";
import { CompanyTile } from "@/components/cards";

type Props = {
  companies: Company[];
  selectedIds: Set<string>;
  primaryId: string | null;
  onToggleSelect: (id: string) => void;
  onSetPrimary: (id: string) => void;
  selectable?: boolean;
};

export function CompaniesGrid({
  companies,
  selectedIds,
  primaryId,
  onToggleSelect,
  onSetPrimary,
  selectable = true,
}: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 lg:p-5">
      {companies.map((company) => (
        <CompanyTile
          key={company.id}
          company={company}
          isSelected={selectedIds.has(company.id)}
          isPrimary={primaryId === company.id}
          onToggleSelect={() => onToggleSelect(company.id)}
          onView={() => onSetPrimary(company.id)}
          selectable={selectable}
        />
      ))}
    </div>
  );
}
