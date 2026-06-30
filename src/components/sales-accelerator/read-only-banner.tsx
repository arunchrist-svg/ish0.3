"use client";

import { Eye } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";

export function ReadOnlyBanner() {
  const { isReadOnly, loading } = usePermissions();
  if (loading || !isReadOnly) return null;

  return (
    <div className="hidden lg:flex items-center justify-center gap-2 border-b border-amber-200/60 bg-amber-50 px-4 py-2 text-center text-[12px] font-medium text-amber-900">
      <Eye className="size-3.5" />
      View-only access. Contact your admin to make changes.
    </div>
  );
}
