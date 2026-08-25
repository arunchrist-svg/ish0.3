"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Fires `onLoadMore` when a bottom sentinel enters the scroll root (or viewport).
 * Use for infinite lists instead of a "Load more" button.
 */
export function useLoadMoreOnScroll(options: {
  enabled: boolean;
  loading: boolean;
  onLoadMore?: () => void | Promise<void>;
  root?: RefObject<Element | null> | null;
  /** How early to prefetch before the sentinel is fully visible. */
  rootMargin?: string;
}): RefObject<HTMLDivElement | null> {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(options.loading);
  const onLoadMoreRef = useRef(options.onLoadMore);
  loadingRef.current = options.loading;
  onLoadMoreRef.current = options.onLoadMore;

  const rootMargin = options.rootMargin ?? "240px 0px";
  const root = options.root ?? null;

  useEffect(() => {
    if (!options.enabled || !onLoadMoreRef.current) return;
    const target = sentinelRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (loadingRef.current) return;
        void onLoadMoreRef.current?.();
      },
      {
        root: root?.current ?? null,
        rootMargin,
        threshold: 0,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [options.enabled, root, rootMargin]);

  return sentinelRef;
}
