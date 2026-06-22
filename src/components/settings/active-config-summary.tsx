import { PanelCard, text } from "@/design-system";
import type { EnrichmentConfig } from "@/lib/enrichment/config";

export function ActiveConfigSummary({ config }: { config: EnrichmentConfig }) {
  return (
    <PanelCard tone="yellow" className="h-full rounded-[20px] border border-ish-border/60 p-5 shadow-[var(--shadow-ish-sm)]">
      <p className={text.label}>Active Configuration</p>
      <code className="mt-2 block rounded-[12px] bg-white/60 px-3 py-3 text-[12px] text-ish-ink backdrop-blur-sm">
        ENRICHMENT_SEARCH_PROVIDER=&quot;{config.searchProvider}&quot;<br />
        ENRICHMENT_ENRICH_PROVIDER=&quot;{config.enrichProvider}&quot;<br />
        ENRICHMENT_FALLBACK_TO_AI=&quot;{String(config.fallbackToAI)}&quot;<br />
        ENRICHMENT_ENRICH_ON_IMPORT=&quot;{String(config.enrichOnImport)}&quot;<br />
        DEFAULT_DATA_MODE=&quot;{config.dataMode}&quot;<br />
        SCOUT_COMPANIES_LIMIT=&quot;{config.scoutCompaniesLimit}&quot;<br />
        SCOUT_LEADS_LIMIT=&quot;{config.scoutLeadsLimit}&quot;
      </code>
      <p className="mt-2 text-[11px] text-ish-ink-faint">
        Copy these into your <code className="rounded bg-white/50 px-1">.env.local</code> to persist across restarts.
      </p>
    </PanelCard>
  );
}
