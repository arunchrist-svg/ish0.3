"use client";

import { useCallback, useSyncExternalStore } from "react";

function subscribeMedia(query: string, onStoreChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function getMediaSnapshot(query: string) {
  return window.matchMedia(query).matches;
}

function getMediaServerSnapshot() {
  return false;
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeMedia(query, onStoreChange),
    [query],
  );
  const getSnapshot = useCallback(() => getMediaSnapshot(query), [query]);

  return useSyncExternalStore(subscribe, getSnapshot, getMediaServerSnapshot);
}

export function useIsMobileLayout(): boolean {
  return useMediaQuery("(max-width: 1023px)");
}
