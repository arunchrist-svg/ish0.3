import { Suspense } from "react";
import { ScoutingApp } from "@/components/scouting/scouting-app";

export default function ScoutingPage() {
  return (
    <Suspense fallback={null}>
      <ScoutingApp />
    </Suspense>
  );
}
