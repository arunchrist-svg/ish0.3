"use client";

import { useSession } from "@/components/providers/session-provider";

export type PermissionFlags = {
  canManageBilling: boolean;
  canManageTeam: boolean;
  canManageSettings: boolean;
  canWritePipeline: boolean;
  isReadOnly: boolean;
};

export function usePermissions() {
  const { session, loading } = useSession();
  const permissions = session?.permissions ?? null;

  return {
    permissions,
    loading,
    canWritePipeline: permissions?.canWritePipeline ?? false,
    isReadOnly: permissions?.isReadOnly ?? false,
  };
}
