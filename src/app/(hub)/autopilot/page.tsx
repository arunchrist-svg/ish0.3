"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

const AutopilotApp = dynamic(
  () => import("@/components/autopilot/autopilot-app").then((m) => m.AutopilotApp),
  { ssr: false, loading: () => null },
);

export default function AutopilotPage() {
  return (
    <Suspense fallback={null}>
      <AutopilotApp />
    </Suspense>
  );
}
