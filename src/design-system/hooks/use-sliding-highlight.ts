"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type HighlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export function useSlidingHighlight(activeKey: string) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [rect, setRect] = useState<HighlightRect | null>(null);
  const [ready, setReady] = useState(false);

  const register = useCallback(
    (key: string) => (node: HTMLElement | null) => {
      if (node) itemRefs.current.set(key, node);
      else itemRefs.current.delete(key);
    },
    [],
  );

  useEffect(() => {
    const measure = () => {
      const container = containerRef.current;
      const item = activeKey ? itemRefs.current.get(activeKey) : null;
      if (!container || !item) return;

      const containerBox = container.getBoundingClientRect();
      const itemBox = item.getBoundingClientRect();
      setRect({
        top: itemBox.top - containerBox.top,
        left: itemBox.left - containerBox.left,
        width: itemBox.width,
        height: itemBox.height,
      });
      setReady(true);
    };

    measure();
    const raf = requestAnimationFrame(measure);

    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [activeKey]);

  return { containerRef, register, rect, ready };
}
