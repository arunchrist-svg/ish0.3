import type { EnrichmentConfig } from "@/lib/enrichment/config";
import { SettingsGroup } from "@/components/settings/settings-group";

export function ActiveConfigSummary({ config }: { config: EnrichmentConfig }) {
  return (
    <SettingsGroup
      title="Environment"
      footer="Copy these into your .env.local to persist across restarts."
    >
      <pre className="overflow-x-auto px-4 py-4 font-mono text-[11px] leading-relaxed text-ish-ink-soft">
{`ENRICHMENT_SEARCH_PROVIDER="${config.searchProvider}"
ENRICHMENT_ENRICH_PROVIDER="${config.enrichProvider}"
ENRICHMENT_FALLBACK_TO_AI="${String(config.fallbackToAI)}"
ENRICHMENT_ENRICH_ON_IMPORT="${String(config.enrichOnImport)}"
DEFAULT_DATA_MODE="${config.dataMode}"
SCOUT_COMPANIES_LIMIT="${config.scoutCompaniesLimit}"
SCOUT_LEADS_LIMIT="${config.scoutLeadsLimit}"`}
      </pre>
    </SettingsGroup>
  );
}
