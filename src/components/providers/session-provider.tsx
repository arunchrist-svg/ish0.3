"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { PermissionFlags } from "@/hooks/use-permissions";

export type SessionData = {
  user: { id: string; email: string; name: string };
  tenant: {
    id: string;
    name?: string;
    slug: string;
    plan?: string;
    demoMode?: boolean;
    onboardingStatus?: string;
    onboardingStep?: number;
  };
  workspaceId: string;
  role: string;
  platformRole: string;
  isSuperadmin: boolean;
  mustChangePassword: boolean;
  permissions: PermissionFlags;
  sendMode: string;
  credits: number;
};

type SessionContextValue = {
  session: SessionData | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        setSession(null);
        return;
      }
      const data = (await res.json()) as SessionData;
      setSession(data);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ session, loading, refresh }),
    [session, loading, refresh],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return ctx;
}
