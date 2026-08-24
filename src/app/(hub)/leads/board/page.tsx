"use client";

import dynamic from "next/dynamic";

const LeadsBoardApp = dynamic(
  () => import("@/components/leads-board/leads-board-app").then((m) => m.LeadsBoardApp),
  { ssr: false, loading: () => <div className="p-8 text-brand-ink-faint">Loading…</div> },
);

export default function LeadsBoardPage() {
  return <LeadsBoardApp />;
}
