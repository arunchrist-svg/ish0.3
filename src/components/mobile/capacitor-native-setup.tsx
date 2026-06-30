"use client";

import { useEffect } from "react";
import { applyNativeChrome } from "@/lib/capacitor/native-chrome";

/** Applies Stratus status bar + hides native splash on Capacitor shells. */
export function CapacitorNativeSetup() {
  useEffect(() => {
    void applyNativeChrome();
  }, []);

  return null;
}
