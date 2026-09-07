"use client";

import Link from "next/link";
import { CheckCircle2, Sparkles, Telescope, Wrench } from "lucide-react";
import { SettingsGroup, SettingsGroupDivider, SettingsRow } from "@/components/settings/settings-group";
import {
  isAgenticSearchProvider,
  type EnrichmentConfig,
} from "@/lib/enrichment/config";
import { cn } from "@/lib/utils";

type Props = {
  config: EnrichmentConfig | null;
  onUpdate: <K extends keyof EnrichmentConfig>(key: K, value: EnrichmentConfig[K]) => void;
};

export function AiTab({ config, onUpdate }: Props) {
  if (!config) {
    return (
      <div className="flex flex-1 items-center justify-center py-16 text-[13px] text-brand-ink-faint">
        Loading AI settings…
      </div>
    );
  }

  const agentic = isAgenticSearchProvider(config.searchProvider);

  function enableAgentic() {
    onUpdate("searchProvider", "agentic_ai");
    onUpdate("aiOperatingMode", "agentic");
  }

  return (
    <div className="pb-6">
      <SettingsGroup
        title="Lead finding"
        footer="Agentic AI is selected under Enrichment → Company search, the same way you pick Tavily or Places. Results show in the Scouting tab as company cards and leads."
      >
        <SettingsRow className="items-start gap-3 py-4">
          <div
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-2xl",
              "bg-brand-stratus-blue/10 text-brand-stratus-blue",
            )}
          >
            <Sparkles className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-[15px] font-semibold text-brand-ink">
                Scout agent team in Scouting
              </h4>
              {agentic ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-green-soft px-2 py-0.5 text-[10px] font-semibold text-brand-green">
                  <CheckCircle2 className="size-3" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-brand-app px-2 py-0.5 text-[10px] font-semibold text-brand-ink-soft">
                  Classic providers
                </span>
              )}
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-brand-ink-soft">
              {agentic
                ? "Company search is Agentic AI. Pick Directories (Tavily) or Places + Apollo under Enrichment → Agentic data stack. Open Scouting to run Scout and Fetch Leads."
                : "Company search is currently a classic provider. Switch to Agentic AI under Enrichment to use the agent team in Scouting."}
            </p>
            <ul className="mt-3 space-y-1.5 text-[12px] text-brand-ink-soft">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-brand-green" />
                Companies and leads appear in the Scouting tab (select, review, Add leads)
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-brand-green" />
                Uses Area of Interest, focus areas, volume, and preference ICP
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-brand-green" />
                Optional no-Tavily stack: Google Places companies + Apollo people
              </li>
            </ul>
            {!agentic ? (
              <button
                type="button"
                onClick={enableAgentic}
                className="mt-4 rounded-full bg-brand-black px-3.5 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
              >
                Use Agentic AI
              </button>
            ) : null}
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Where to run it" className="mb-4">
        <Link
          href="/scouting"
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-black/[0.025]"
        >
          <Telescope className="size-4 shrink-0 text-brand-ink-soft" />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium text-brand-ink">Scouting</div>
            <p className="text-[12px] text-brand-ink-soft">
              Primary place for Agentic Scout. Companies and leads land here like any other provider.
            </p>
          </div>
          <span className="rounded-full bg-brand-black px-3 py-1.5 text-[11px] font-semibold text-white">
            Open
          </span>
        </Link>
        <SettingsGroupDivider />
        <Link
          href="/settings?tab=enrichment"
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-black/[0.025]"
        >
          <Wrench className="size-4 shrink-0 text-brand-ink-soft" />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium text-brand-ink">Enrichment → Company search</div>
            <p className="text-[12px] text-brand-ink-soft">
              Switch between Agentic AI, India + Tavily, Places, Tavily, and Apollo.
            </p>
          </div>
          <span className="rounded-full border border-brand-border bg-white px-3 py-1.5 text-[11px] font-semibold text-brand-ink">
            Open
          </span>
        </Link>
      </SettingsGroup>
    </div>
  );
}
