import { Suspense } from "react";
import { SalesAcceleratorApp } from "@/components/sales-accelerator/sales-accelerator-app";

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-brand-ink-faint">Loading…</div>}>
      <SalesAcceleratorApp />
    </Suspense>
  );
}
