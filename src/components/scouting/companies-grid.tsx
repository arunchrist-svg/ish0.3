"use client";

import type { Company } from "@/lib/scouting-data";
import { CompanyTile } from "./company-tile";

type Props = {
  companies: Company[];
  selectedIds: Set<string>;
  primaryId: string | null;
  onToggleSelect: (id: string) => void;
  onSetPrimary: (id: string) => void;
};

export function CompaniesGrid({ companies, selectedIds, primaryId, onToggleSelect, onSetPrimary }: Props) {
  return (
    <div className="grid grid-cols-4 gap-3 p-5">
      {companies.map((company) => (
        <CompanyTile
          key={company.id}
          company={company}
          isSelected={selectedIds.has(company.id)}
          isPrimary={primaryId === company.id}
          onToggleSelect={() => onToggleSelect(company.id)}
          onView={() => onSetPrimary(company.id)}
        />
      ))}
    </div>
  );
}
