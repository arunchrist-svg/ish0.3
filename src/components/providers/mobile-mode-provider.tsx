"use client";

import { createContext, useContext } from "react";
import { useIsMobileLayout } from "@/hooks/use-media-query";

type MobileModeContextValue = {
  isMobile: boolean;
};

const MobileModeContext = createContext<MobileModeContextValue>({ isMobile: false });

export function MobileModeProvider({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobileLayout();
  return <MobileModeContext.Provider value={{ isMobile }}>{children}</MobileModeContext.Provider>;
}

export function useMobileMode(): MobileModeContextValue {
  return useContext(MobileModeContext);
}
