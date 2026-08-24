"use client";

import dynamic from "next/dynamic";

const EmailApp = dynamic(
  () => import("@/components/email/email-app").then((m) => m.EmailApp),
  { ssr: false, loading: () => <div className="p-8 text-brand-ink-faint">Loading…</div> },
);

export default function EmailPage() {
  return <EmailApp />;
}
