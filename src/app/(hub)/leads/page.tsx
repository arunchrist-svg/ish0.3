"use client";

import { Suspense, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";

const SalesAcceleratorApp = dynamic(
  () =>
    import("@/components/sales-accelerator/sales-accelerator-app").then((m) => m.SalesAcceleratorApp),
  { ssr: false, loading: () => <div className="p-8 text-brand-ink-faint">Loading…</div> },
);

function LeadsEntry() {
  const router = useRouter();
  const search = useSearchParams();
  // Deep links to a specific lead stay on list. Bare /leads opens Board by default.
  const keepList = search.has("lead") || search.has("tab");

  useEffect(() => {
    if (!keepList) router.replace("/leads/board");
  }, [keepList, router]);

  if (!keepList) {
    return <div className="p-8 text-brand-ink-faint">Loading…</div>;
  }

  return <SalesAcceleratorApp />;
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-brand-ink-faint">Loading…</div>}>
      <LeadsEntry />
    </Suspense>
  );
}
