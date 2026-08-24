"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { companyLogoLookupSrc, getCompanyInitials, getCompanyLogoSources } from "@/lib/company-logo";

type CompanyLogoProps = {
  name: string;
  domain?: string | null;
  website?: string | null;
  logo?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  imageClassName?: string;
  rounded?: string;
  /** Slow Wikipedia/DDG lookup. Only enable on detail panels, not lists. */
  wikiLookup?: boolean;
};

const SIZE_MAP = {
  sm: { box: "size-8 text-[11px]", img: "size-7" },
  md: { box: "size-12 text-[13px]", img: "size-10" },
  lg: { box: "size-14 text-[15px]", img: "size-12" },
  xl: { box: "size-16 text-[18px]", img: "size-14" },
} as const;

const INITIAL_TONES = [
  "bg-brand-yellow text-brand-ink",
  "bg-brand-stratus-blue text-white",
  "bg-brand-pink-soft text-brand-stratus-salmon",
  "bg-brand-green-soft text-brand-ink",
  "bg-brand-yellow-soft text-brand-ink",
] as const;

const CLIENT_LOOKUP_CACHE = new Map<string, string | null>();

function initialTone(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash + ch.charCodeAt(0) * 17) % INITIAL_TONES.length;
  return INITIAL_TONES[hash] ?? INITIAL_TONES[0];
}

async function fetchWikiLogo(lookupUrl: string): Promise<string | undefined> {
  const cached = CLIENT_LOOKUP_CACHE.get(lookupUrl);
  if (cached !== undefined) return cached ?? undefined;

  try {
    const res = await fetch(lookupUrl);
    if (!res.ok) {
      CLIENT_LOOKUP_CACHE.set(lookupUrl, null);
      return undefined;
    }
    const data = (await res.json()) as { url?: string | null };
    const url = data.url ?? null;
    CLIENT_LOOKUP_CACHE.set(lookupUrl, url);
    return url ?? undefined;
  } catch {
    CLIENT_LOOKUP_CACHE.set(lookupUrl, null);
    return undefined;
  }
}

export function CompanyLogo({
  name,
  domain,
  website,
  logo,
  size = "md",
  className,
  imageClassName,
  rounded = "rounded-[12px]",
  wikiLookup = false,
}: CompanyLogoProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const directSources = useMemo(
    () => getCompanyLogoSources({ domain, website, name, logo }, { includeLookup: false }),
    [domain, website, name, logo],
  );
  const lookupUrl = useMemo(
    () => (wikiLookup ? companyLogoLookupSrc({ domain, website, name }) : undefined),
    [wikiLookup, domain, website, name],
  );

  const [sources, setSources] = useState<string[]>(directSources);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const wikiRequestedRef = useRef(false);

  useEffect(() => {
    setSources(directSources);
    setSourceIndex(0);
    setExhausted(false);
    wikiRequestedRef.current = false;
  }, [directSources]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "120px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const requestWikiLookup = useCallback(async (): Promise<boolean> => {
    if (!lookupUrl || wikiRequestedRef.current) return false;
    wikiRequestedRef.current = true;
    const url = await fetchWikiLogo(lookupUrl);
    if (url) {
      setSources((prev) => {
        const nextIndex = prev.length;
        setSourceIndex(nextIndex);
        return [...prev, url];
      });
      setExhausted(false);
      return true;
    }
    return false;
  }, [lookupUrl]);

  useEffect(() => {
    if (!visible || !wikiLookup || !lookupUrl || directSources.length > 0) return;
    void requestWikiLookup();
  }, [visible, wikiLookup, lookupUrl, directSources.length, requestWikiLookup]);

  const currentSrc = visible && !exhausted ? sources[sourceIndex] : undefined;
  const dims = SIZE_MAP[size];
  const initials = getCompanyInitials(name);

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden ring-1 ring-brand-border/50",
        rounded,
        dims.box,
        currentSrc ? "bg-white" : initialTone(name),
        className,
      )}
      title={name}
    >
      {currentSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={currentSrc}
          src={currentSrc}
          alt={`${name} logo`}
          loading="lazy"
          decoding="async"
          className={cn("object-contain p-0.5", dims.img, imageClassName)}
          referrerPolicy="no-referrer"
          onError={() => {
            if (sourceIndex < sources.length - 1) {
              setSourceIndex((i) => i + 1);
              return;
            }
            if (wikiLookup && lookupUrl) {
              void requestWikiLookup().then((found) => {
                if (!found) setExhausted(true);
              });
              return;
            }
            setExhausted(true);
          }}
        />
      ) : (
        <span className="font-extrabold tracking-tight">{initials}</span>
      )}
    </div>
  );
}
