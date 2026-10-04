"use client";

import { useEffect } from "react";
import { publicApiErrorMessage } from "@/lib/api-error-message";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", publicApiErrorMessage(error));
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-canvas px-6">
      <div className="max-w-md space-y-4 text-center">
        <p className="text-[15px] font-semibold text-brand-ink">Something went wrong</p>
        <p className="text-[13px] leading-relaxed text-brand-ink-soft">{publicApiErrorMessage(error)}</p>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-full border border-brand-border bg-white px-4 py-2 text-[13px] font-semibold text-brand-ink"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
