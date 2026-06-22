"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, UserPlus } from "lucide-react";
import { IshAvatar } from "@/design-system";
import { fetchLeadNetwork } from "@/lib/api-client";
import type { NetworkGraph, WarmIntro } from "@/lib/network/types";
import { cn } from "@/lib/utils";

type Props = {
  leadId: string;
};

function StrengthDots({ strength }: { strength: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4].map((n) => (
        <span
          key={n}
          className={cn("size-1.5 rounded-full", n <= strength ? "bg-ish-green" : "bg-ish-green/20")}
        />
      ))}
    </span>
  );
}

function IntroRow({ intro, index }: { intro: WarmIntro; index: number }) {
  return (
    <div className="flex items-start gap-3 rounded-[14px] border border-ish-border bg-white p-3.5">
      <IshAvatar name={intro.name} index={index} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[13px] font-bold text-ish-ink">{intro.name}</p>
          <StrengthDots strength={intro.strength} />
        </div>
        <p className="mt-0.5 text-[11px] text-ish-ink-soft">{intro.relationship}</p>
        {intro.connectorName !== "CRM" && (
          <p className="text-[11px] text-ish-ink-faint">Connector: {intro.connectorName}</p>
        )}
        <p className="mt-1 text-[10px] text-ish-ink-faint">{intro.path.join(" → ")}</p>
      </div>
      <button
        type="button"
        className="shrink-0 rounded-[10px] border border-ish-border px-2.5 py-1.5 text-[10px] font-semibold text-ish-ink-soft"
        title="Coming soon"
      >
        Request intro
      </button>
    </div>
  );
}

function GraphTree({ graph }: { graph: NetworkGraph }) {
  const target = graph.nodes.find((n) => n.type === "target");
  const connectors = graph.nodes.filter((n) => n.type === "connector");
  const bridges = graph.nodes.filter((n) => n.type === "bridge");
  const colleagues = graph.nodes.filter((n) => n.type === "colleague");

  return (
    <div className="space-y-4 text-[12px]">
      {target && (
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ish-ink-faint">Target</p>
          <div className="rounded-[12px] bg-ish-green/10 px-3 py-2 font-semibold text-ish-ink">{target.name}</div>
        </div>
      )}
      {colleagues.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ish-ink-faint">Colleagues at company</p>
          <ul className="space-y-1">
            {colleagues.map((c) => (
              <li key={c.id} className="rounded-[10px] bg-ish-app px-3 py-1.5 text-ish-ink-soft">{c.name}</li>
            ))}
          </ul>
        </div>
      )}
      {connectors.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ish-ink-faint">ISH team paths</p>
          <ul className="space-y-2">
            {connectors.map((c) => {
              const linkedBridges = graph.edges
                .filter((e) => e.from === c.id && e.kind !== "crm_colleague")
                .map((e) => bridges.find((b) => b.id === e.to)?.name)
                .filter(Boolean);
              return (
                <li key={c.id} className="rounded-[10px] border border-ish-border px-3 py-2">
                  <span className="font-semibold text-ish-ink">{c.name}</span>
                  {linkedBridges.length > 0 && (
                    <span className="text-ish-ink-faint"> → {linkedBridges.join(", ")}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {graph.warmIntros.filter((w) => w.strength === 2).length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-ish-ink-faint">Company network (2-hop)</p>
          <ul className="space-y-1">
            {graph.warmIntros
              .filter((w) => w.strength === 2)
              .map((w, i) => (
                <li key={i} className="text-ish-ink-soft">{w.path.join(" → ")}</li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function RelationshipAnalyticsPanel({ leadId }: Props) {
  const [graph, setGraph] = useState<NetworkGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchLeadNetwork(leadId)
      .then((g) => {
        if (!cancelled) setGraph(g);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load relationship graph");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-ish-ink-faint">
        <Loader2 className="mr-2 size-4 animate-spin" /> Loading relationship graph…
      </div>
    );
  }

  if (error || !graph) {
    return (
      <div className="px-[22px] py-12 text-center text-ish-ink-soft">
        {error ?? "No graph data"}
      </div>
    );
  }

  if (graph.warmIntros.length === 0) {
    return (
      <div className="mx-[22px] my-8 rounded-[18px] border border-dashed border-ish-border bg-ish-app/50 p-10 text-center">
        <UserPlus className="mx-auto mb-3 size-8 text-ish-ink-faint" />
        <p className="text-[14px] font-semibold text-ish-ink">No warm-intro paths found</p>
        <p className="mt-1 text-[12px] text-ish-ink-soft">
          Connect LinkedIn and import your Connections.csv to discover who on your team knows this lead.
        </p>
        <Link
          href="/settings?tab=integrations"
          className="mt-4 inline-block rounded-[12px] bg-ish-black px-4 py-2 text-[12px] font-bold text-white"
        >
          Set up LinkedIn integration
        </Link>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 px-[22px] py-5 lg:grid-cols-2">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-bold text-ish-ink">Warm intro paths</h3>
          <span className="text-[11px] text-ish-ink-faint">
            {graph.summary.directPaths} direct · {graph.summary.colleaguePaths} via colleagues
          </span>
        </div>
        {graph.warmIntros.map((intro, i) => (
          <IntroRow key={`${intro.path.join("-")}-${i}`} intro={intro} index={i} />
        ))}
      </div>
      <div className="rounded-[18px] border border-ish-border bg-ish-app/40 p-4">
        <h3 className="mb-3 text-[14px] font-bold text-ish-ink">Relationship map</h3>
        <GraphTree graph={graph} />
        <p className="mt-4 text-[10px] text-ish-ink-faint">
          Computed {new Date(graph.summary.lastComputedAt).toLocaleString()}
        </p>
      </div>
    </div>
  );
}
