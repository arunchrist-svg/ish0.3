"use client";

import { TooltipProvider } from "@/design-system";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/design-system";
import { CapacitorNativeSetup } from "@/components/mobile/capacitor-native-setup";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <CapacitorNativeSetup />
        {children}
        <Toaster richColors position="bottom-right" />
      </TooltipProvider>
    </ThemeProvider>
  );
}
