"use client";

import { useEffect, useState } from "react";

export type PermissionFlags = {
  canManageBilling: boolean;
  canManageTeam: boolean;
  canManageSettings: boolean;
  canWritePipeline: boolean;
  isReadOnly: boolean;
};

type MeResponse = {
  permissions?: PermissionFlags;
  mustChangePassword?: boolean;
  role?: string;
};

export function usePermissions() {
  const [permissions, setPermissions] = useState<PermissionFlags | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: MeResponse | null) => {
        if (data?.permissions) setPermissions(data.permissions);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return {
    permissions,
    loading,
    canWritePipeline: permissions?.canWritePipeline ?? false,
    isReadOnly: permissions?.isReadOnly ?? false,
  };
}
