"use client";

import { TooltipProvider } from "@/design-system";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/design-system";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <TooltipProvider>
        {children}
        <Toaster richColors position="bottom-right" />
      </TooltipProvider>
    </ThemeProvider>
  );
}
