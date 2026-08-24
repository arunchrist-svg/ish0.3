"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

const SalesAcceleratorApp = dynamic(
  () =>
    import("@/components/sales-accelerator/sales-accelerator-app").then((m) => m.SalesAcceleratorApp),
  { ssr: false, loading: () => <div className="p-8 text-brand-ink-faint">Loading…</div> },
);

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-brand-ink-faint">Loading…</div>}>
      <SalesAcceleratorApp />
    </Suspense>
  );
}
