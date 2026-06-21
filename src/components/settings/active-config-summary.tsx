import { PanelCard, text } from "@/design-system";
import type { EnrichmentConfig } from "@/lib/enrichment/config";

export function ActiveConfigSummary({ config }: { config: EnrichmentConfig }) {
  return (
    <PanelCard tone="white" className="mt-6 rounded-[18px] border border-ish-border p-4 shadow-none">
      <p className={text.label}>Active Configuration</p>
      <code className="mt-2 block text-[12px] text-ish-ink">
        ENRICHMENT_SEARCH_PROVIDER=&quot;{config.searchProvider}&quot;<br />
        ENRICHMENT_ENRICH_PROVIDER=&quot;{config.enrichProvider}&quot;<br />
        ENRICHMENT_FALLBACK_TO_AI=&quot;{String(config.fallbackToAI)}&quot;<br />
        ENRICHMENT_ENRICH_ON_IMPORT=&quot;{String(config.enrichOnImport)}&quot;<br />
        DEFAULT_DATA_MODE=&quot;{config.dataMode}&quot;<br />
        SCOUT_COMPANIES_LIMIT=&quot;{config.scoutCompaniesLimit}&quot;<br />
        SCOUT_LEADS_LIMIT=&quot;{config.scoutLeadsLimit}&quot;
      </code>
      <p className="mt-2 text-[11px] text-ish-ink-faint">
        Copy these into your <code>.env.local</code> to persist across restarts.
      </p>
    </PanelCard>
  );
}
