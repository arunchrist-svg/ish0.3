"use client";

import dynamic from "next/dynamic";

const DirectoryApp = dynamic(
  () => import("@/components/directory/directory-app").then((m) => m.DirectoryApp),
  { ssr: false, loading: () => <div className="p-8 text-brand-ink-faint">Loading…</div> },
);

export default function DirectoryPage() {
  return <DirectoryApp />;
}
