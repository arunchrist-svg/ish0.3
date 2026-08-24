"use client";

import dynamic from "next/dynamic";

const SettingsApp = dynamic(
  () => import("@/components/settings/settings-app").then((m) => m.SettingsApp),
  { ssr: false, loading: () => <div className="p-8 text-brand-ink-faint">Loading…</div> },
);

export default function SettingsPage() {
  return <SettingsApp />;
}
