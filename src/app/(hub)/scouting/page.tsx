"use client";

import { Suspense } from "react";
import dynamic from "next/dynamic";

const ScoutingApp = dynamic(
  () => import("@/components/scouting/scouting-app").then((m) => m.ScoutingApp),
  { ssr: false, loading: () => null },
);

export default function ScoutingPage() {
  return (
    <Suspense fallback={null}>
      <ScoutingApp />
    </Suspense>
  );
}
