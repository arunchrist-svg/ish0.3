"use client";

import { useMemo, useState } from "react";
import { getIndustryByLabel, type IndustryCatalogEntry } from "@/lib/gift-intel/industry-catalog";
import { CompetitorBrandsEditor } from "@/components/brand-intelligence/competitor-brands-editor";
import { ProductCategoryPicker } from "@/components/brand-intelligence/product-category-picker";
import { SuggestedCompetitorsPicker } from "@/components/brand-intelligence/suggested-competitors-picker";

type Props = {
  productCategory: string;
  competitorBrands: string[];
  onProductCategoryChange: (value: string) => void;
  onCompetitorBrandsChange: (brands: string[]) => void;
  categoryDesc?: string;
  competitorsDesc?: string;
  categoryPlaceholder?: string;
  competitorPlaceholder?: string;
};

function toggleBrand(selected: string[], brand: string): string[] {
  const normalized = brand.toLowerCase();
  const exists = selected.some((item) => item.toLowerCase() === normalized);
  if (exists) return selected.filter((item) => item.toLowerCase() !== normalized);
  return [...selected, brand];
}

export function BrandIntelligenceSetup({
  productCategory,
  competitorBrands,
  onProductCategoryChange,
  onCompetitorBrandsChange,
  categoryDesc = "Target product type for OSINT sweeps",
  competitorsDesc = "These appear as sweep targets on Brand Intelligence. Add or delete anytime later in Settings.",
  categoryPlaceholder = "Start typing, e.g. kit",
  competitorPlaceholder = "Add a competitor brand",
}: Props) {
  const [selectedIndustry, setSelectedIndustry] = useState<IndustryCatalogEntry | null>(() =>
    getIndustryByLabel(productCategory),
  );

  const suggestedCompetitors = useMemo(() => {
    if (selectedIndustry && selectedIndustry.label === productCategory.trim()) {
      return selectedIndustry.suggestedCompetitors;
    }
    return getIndustryByLabel(productCategory)?.suggestedCompetitors ?? [];
  }, [productCategory, selectedIndustry]);

  return (
    <div className="space-y-8">
      <div>
        <label className="mb-1.5 block text-[13px] font-semibold text-ish-ink">Product category</label>
        <p className="mb-2 text-[11.5px] text-ish-ink-soft">{categoryDesc}</p>
        <ProductCategoryPicker
          value={productCategory}
          onChange={onProductCategoryChange}
          onIndustrySelect={setSelectedIndustry}
          placeholder={categoryPlaceholder}
        />
      </div>

      {suggestedCompetitors.length > 0 ? (
        <SuggestedCompetitorsPicker
          suggestions={suggestedCompetitors}
          selected={competitorBrands}
          onToggle={(brand) => onCompetitorBrandsChange(toggleBrand(competitorBrands, brand))}
        />
      ) : null}

      <div>
        <label className="mb-1.5 block text-[13px] font-semibold text-ish-ink">Competitor brands</label>
        <p className="mb-2 text-[11.5px] text-ish-ink-soft">{competitorsDesc}</p>
        <CompetitorBrandsEditor
          brands={competitorBrands}
          onChange={onCompetitorBrandsChange}
          placeholder={competitorPlaceholder}
        />
      </div>
    </div>
  );
}
