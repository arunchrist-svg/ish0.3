import { tavilySearch } from "./tavily-client";
import {
  buildComingSoonQueriesForSource,
  buildOccasionQueriesForSource,
  comingSoonSweepSources,
  hitMatchesComingSoonSource,
  occasionSweepSources,
  passesComingSoonPreFilter,
  passesOccasionPreFilter,
  signalTypeForComingSoonQuery,
  type OccasionSweepFamily,
} from "@/lib/brand-intel/occasion-sources";
import { uniqueDefaultTiers } from "@/lib/brand-intel/sources";
import type { RawGiftIntelPost, SourceTier } from "@/lib/brand-intel/types";

const MAX_UNIQUE_HITS = 50;

function hitMatchesSource(url: string, domains: string[], pathHints: string[]): boolean {
  const lower = url.toLowerCase();
  if (!domains.some((d) => lower.includes(d))) return false;
  if (pathHints.length === 0) return true;
  return pathHints.some((h) => lower.includes(h));
}

export type DiscoverOccasionIntelParams = {
  family: OccasionSweepFamily;
  enabledSourceTiers?: SourceTier[];
  targetCity?: string;
};

export type DiscoverOccasionIntelResult = {
  posts: RawGiftIntelPost[];
  queriesRun: number;
  hitsFound: number;
  errors: string[];
  byTier: Record<number, number>;
};

export async function discoverOccasionIntelPosts(
  params: DiscoverOccasionIntelParams,
): Promise<DiscoverOccasionIntelResult> {
  if (params.family === "coming_soon") {
    return discoverComingSoonPosts(params);
  }

  const tiers = params.enabledSourceTiers?.length
    ? params.enabledSourceTiers
    : uniqueDefaultTiers().filter((t) => t === 1 || t === 2);
  const sources = occasionSweepSources(tiers);
  const seen = new Set<string>();
  const posts: RawGiftIntelPost[] = [];
  const errors: string[] = [];
  const byTier: Record<number, number> = {};
  let queriesRun = 0;
  let hitsFound = 0;

  for (const source of sources) {
    const queries = buildOccasionQueriesForSource(source, params.family, params.targetCity);

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
            sourceId: source.id,
            sourceTier: source.tier,
          };
          if (!passesOccasionPreFilter(candidate)) continue;
          posts.push(candidate);
          byTier[source.tier] = (byTier[source.tier] ?? 0) + 1;
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    if (posts.length >= MAX_UNIQUE_HITS) break;
  }

  return { posts, queriesRun, hitsFound, errors, byTier };
}

async function discoverComingSoonPosts(
  params: DiscoverOccasionIntelParams,
): Promise<DiscoverOccasionIntelResult> {
  const tiers = params.enabledSourceTiers?.length
    ? params.enabledSourceTiers
    : uniqueDefaultTiers().filter((t) => t === 1 || t === 2);
  const sources = comingSoonSweepSources(tiers);
  const seen = new Set<string>();
  const posts: RawGiftIntelPost[] = [];
  const errors: string[] = [];
  const byTier: Record<number, number> = {};
  let queriesRun = 0;
  let hitsFound = 0;

  for (const source of sources) {
    const queries = buildComingSoonQueriesForSource(source, params.targetCity);

    for (let qi = 0; qi < queries.length; qi++) {
      if (posts.length >= MAX_UNIQUE_HITS) break;
      queriesRun++;
      const signalType = signalTypeForComingSoonQuery(source, qi);

      try {
        const hits = await tavilySearch(queries[qi], source.resultsPerQuery);
        hitsFound += hits.length;

        for (const hit of hits) {
          if (seen.has(hit.url)) continue;
          if (!hitMatchesComingSoonSource(hit.url, source.domains, source.pathHints)) continue;
          seen.add(hit.url);
          const text = [hit.title, hit.content].filter(Boolean).join("\n");
          const candidate: RawGiftIntelPost = {
            url: hit.url,
            text,
            title: hit.title,
            sourceId: source.id,
            sourceTier: source.tier,
            signalType,
          };
          if (!passesComingSoonPreFilter(candidate)) continue;
          posts.push(candidate);
          byTier[source.tier] = (byTier[source.tier] ?? 0) + 1;
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }

    if (posts.length >= MAX_UNIQUE_HITS) break;
  }

  return { posts, queriesRun, hitsFound, errors, byTier };
}
