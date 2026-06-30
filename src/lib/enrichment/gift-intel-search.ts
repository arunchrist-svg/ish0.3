import { tavilySearch } from "./tavily-client";
import {
  buildQueriesForSource,
  getEnabledSources,
  passesPreFilter,
  uniqueDefaultTiers,
} from "@/lib/gift-intel/sources";
import type { RawGiftIntelPost, SourceTier } from "@/lib/gift-intel/types";

const MAX_UNIQUE_HITS = 50;
const EARLY_STOP_T1 = 15;

function extractImageUrl(url: string, content: string): string | undefined {
  const ogMatch = content.match(/https?:\/\/[^\s"']+\.(?:jpg|jpeg|png|webp)/i);
  if (ogMatch) return ogMatch[0];
  if (/instagram\.com|linkedin\.com/.test(url)) return undefined;
  return undefined;
}

function hitMatchesSource(url: string, domains: string[], pathHints: string[]): boolean {
  const lower = url.toLowerCase();
  if (!domains.some((d) => lower.includes(d))) return false;
  if (pathHints.length === 0) return true;
  return pathHints.some((h) => lower.includes(h));
}

export type DiscoverGiftIntelParams = {
  targetBrand: string;
  targetCategory: string;
  enabledSourceTiers?: SourceTier[];
  brandAliases?: string[];
  targetCity?: string;
};

export type DiscoverGiftIntelResult = {
  posts: RawGiftIntelPost[];
  queriesRun: number;
  hitsFound: number;
  errors: string[];
  byTier: Record<number, number>;
};

export async function discoverGiftIntelPosts(
  params: DiscoverGiftIntelParams,
): Promise<DiscoverGiftIntelResult> {
  const tiers = params.enabledSourceTiers?.length
    ? params.enabledSourceTiers
    : uniqueDefaultTiers();
  const sources = getEnabledSources(tiers);
  const seen = new Set<string>();
  const posts: RawGiftIntelPost[] = [];
  const errors: string[] = [];
  const byTier: Record<number, number> = {};
  let queriesRun = 0;
  let hitsFound = 0;
  let t1Count = 0;

  for (const source of sources) {
    const queries = buildQueriesForSource(source, params.targetBrand, params.targetCategory, params.targetCity);

    for (const query of queries) {
      if (posts.length >= MAX_UNIQUE_HITS) break;
      queriesRun++;

      try {
        const hits = await tavilySearch(query, source.resultsPerQuery);
        hitsFound += hits.length;

        for (const hit of hits) {
          if (seen.has(hit.url)) continue;
          if (!hitMatchesSource(hit.url, source.domains, source.pathHints)) continue;

          seen.add(hit.url);
          const text = [hit.title, hit.content].filter(Boolean).join("\n");
          const candidate: RawGiftIntelPost = {
            url: hit.url,
            text,
            title: hit.title,
            imageUrl: extractImageUrl(hit.url, hit.content),
            sourceId: source.id,
            sourceTier: source.tier,
          };

          if (!passesPreFilter(candidate, params.targetBrand, params.brandAliases)) continue;

          posts.push(candidate);
          byTier[source.tier] = (byTier[source.tier] ?? 0) + 1;
          if (source.tier === 1) t1Count++;
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }

      if (t1Count >= EARLY_STOP_T1 && posts.length >= 10) break;
    }

    if (posts.length >= MAX_UNIQUE_HITS) break;
  }

  return { posts, queriesRun, hitsFound, errors, byTier };
}
