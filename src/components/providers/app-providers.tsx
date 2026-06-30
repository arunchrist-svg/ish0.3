"use client";

import { TooltipProvider } from "@/design-system";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { MobileModeProvider } from "@/components/providers/mobile-mode-provider";
import { Toaster } from "@/design-system";
import { CapacitorNativeSetup } from "@/components/mobile/capacitor-native-setup";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <MobileModeProvider>
        <TooltipProvider>
          <CapacitorNativeSetup />
          {children}
          <Toaster richColors position="bottom-right" />
        </TooltipProvider>
      </MobileModeProvider>
    </ThemeProvider>
  );
}
