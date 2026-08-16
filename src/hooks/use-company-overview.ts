"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCompanyOverview } from "@/lib/api-client";
import type { CompanyOverview, CompanyOverviewInput } from "@/lib/company-overview";

type ResolvedWebsite = {
  domain?: string;
  website?: string;
};

type Options = {
  enabled?: boolean;
  initialOverview?: CompanyOverview;
  onWebsiteResolved?: (resolved: ResolvedWebsite) => void;
};

export function useCompanyOverview(input: CompanyOverviewInput | null, options: Options = {}) {
  const { enabled = true, initialOverview } = options;
  const [overview, setOverview] = useState<CompanyOverview | undefined>(initialOverview);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrichedAt, setEnrichedAt] = useState<string | undefined>();
  const [cached, setCached] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(!!initialOverview);
  const [resolvedDomain, setResolvedDomain] = useState<string | undefined>();
  const [resolvedWebsite, setResolvedWebsite] = useState<string | undefined>();
  const [didFetch, setDidFetch] = useState(false);
  const requestId = useRef(0);
  const onWebsiteResolvedRef = useRef(options.onWebsiteResolved);
  onWebsiteResolvedRef.current = options.onWebsiteResolved;

  const load = useCallback(
    async (force = false) => {
      if (!input?.name?.trim() || !enabled) return;

      const id = ++requestId.current;
      setLoading(true);
      setError(null);

      try {
        const result = await fetchCompanyOverview({ ...input, force });
        if (id !== requestId.current) return;
        setOverview(result.overview);
        setEnrichedAt(result.enrichedAt);
        setCached(result.cached);
        setHasLoaded(true);
        setDidFetch(true);
        setResolvedDomain(result.domain);
        setResolvedWebsite(result.website);
        if (result.domain || result.website) {
          onWebsiteResolvedRef.current?.({ domain: result.domain, website: result.website });
        }
      } catch (e) {
        if (id !== requestId.current) return;
        setError(e instanceof Error ? e.message : "Failed to load company overview");
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [input, enabled],
  );

  // Reset displayed data when company changes; show saved overview if available.
  useEffect(() => {
    requestId.current += 1;
    setLoading(false);
    setError(null);
    setOverview(initialOverview);
    setEnrichedAt(undefined);
    setCached(false);
    setHasLoaded(!!initialOverview);
    setResolvedDomain(undefined);
    setResolvedWebsite(undefined);
    setDidFetch(false);
  }, [
    input?.name,
    input?.accountId,
    initialOverview,
  ]);

  return {
    overview,
    loading,
    error,
    enrichedAt,
    cached,
    hasLoaded,
    resolvedDomain,
    resolvedWebsite,
    didFetch,
    refresh: () => load(true),
    load: () => load(false),
  };
}
