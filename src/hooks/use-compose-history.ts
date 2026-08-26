"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  commitComposeSnapshot,
  createComposeHistory,
  redoCompose,
  snapshotsEqual,
  undoCompose,
  type ComposeHistoryState,
  type ComposeSnapshot,
} from "@/lib/email/compose-history";

const DEFAULT_DEBOUNCE_MS = 400;

/**
 * Debounced undo/redo for email compose.
 * Typing commits after a short pause; call `commitNow` before AI revises.
 */
export function useComposeHistory(
  draftId: string,
  initial: ComposeSnapshot,
  debounceMs = DEFAULT_DEBOUNCE_MS,
) {
  const [history, setHistory] = useState<ComposeHistoryState>(() => createComposeHistory(initial));
  const [pending, setPending] = useState(false);
  const historyRef = useRef(history);
  const liveRef = useRef(initial);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftIdRef = useRef(draftId);

  historyRef.current = history;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback((snap: ComposeSnapshot) => {
    clearTimer();
    liveRef.current = snap;
    const next = createComposeHistory(snap);
    historyRef.current = next;
    setHistory(next);
    setPending(false);
  }, [clearTimer]);

  useEffect(() => {
    if (draftIdRef.current === draftId) return;
    draftIdRef.current = draftId;
    reset(initial);
    // initial is captured for the new draft id only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, reset]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  const flushCommit = useCallback((snap: ComposeSnapshot) => {
    clearTimer();
    liveRef.current = snap;
    setPending(false);
    setHistory((prev) => {
      const next = commitComposeSnapshot(prev, snap);
      historyRef.current = next;
      return next;
    });
  }, [clearTimer]);

  /** Call on every subject/body keystroke. Commits prior state after debounce. */
  const recordChange = useCallback(
    (snap: ComposeSnapshot) => {
      liveRef.current = snap;
      setPending(!snapshotsEqual(snap, historyRef.current.present));
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        flushCommit(snap);
      }, debounceMs);
    },
    [clearTimer, debounceMs, flushCommit],
  );

  /** Immediate commit (before AI revise, or blur). */
  const commitNow = useCallback(
    (snap?: ComposeSnapshot) => {
      flushCommit(snap ?? liveRef.current);
    },
    [flushCommit],
  );

  const undo = useCallback((): ComposeSnapshot | null => {
    clearTimer();
    // Include in-progress typing that has not debounced yet.
    let base = historyRef.current;
    if (!snapshotsEqual(liveRef.current, base.present)) {
      base = commitComposeSnapshot(base, liveRef.current);
    }
    const next = undoCompose(base);
    if (!next) {
      setPending(false);
      return null;
    }
    historyRef.current = next;
    liveRef.current = next.present;
    setPending(false);
    setHistory(next);
    return next.present;
  }, [clearTimer]);

  const redo = useCallback((): ComposeSnapshot | null => {
    clearTimer();
    const next = redoCompose(historyRef.current);
    if (!next) return null;
    historyRef.current = next;
    liveRef.current = next.present;
    setPending(false);
    setHistory(next);
    return next.present;
  }, [clearTimer]);

  return {
    canUndo: history.past.length > 0 || pending,
    canRedo: history.future.length > 0,
    recordChange,
    commitNow,
    undo,
    redo,
    reset,
  };
}
