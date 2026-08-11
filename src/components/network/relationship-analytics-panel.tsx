"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2, Send, UserPlus, Waypoints } from "lucide-react";
import { IshAvatar } from "@/design-system";
import { fetchLeadNetwork } from "@/lib/api-client";
import { linkedInSearchUrl, type ConnectionDegree } from "@/lib/network/degree";
import type { NetworkGraph, NetworkPerson } from "@/lib/network/types";
import { cn, normalizeLinkedInUrl } from "@/lib/utils";

type Props = {
  leadId: string;
  onMessageTarget?: () => void;
};

function profileHref(person: NetworkPerson, companyName: string): string {
  const linkedIn = normalizeLinkedInUrl(person.linkedIn);
  if (linkedIn) return linkedIn;
  if (person.cta === "message" && person.email) return `mailto:${person.email}`;
  return linkedInSearchUrl(person.name, companyName);
}

function roleLine(person: NetworkPerson, companyName?: string): string | null {
  const title = person.title?.trim();
  if (title) return title;
  const headline = person.headline?.trim();
  if (!headline || (companyName && headline === companyName.trim())) return null;
  return headline;
}

function DegreeBadge({ degree, size = "md" }: { degree: ConnectionDegree; size?: "sm" | "md" }) {
  return (
    <span
      className={cn("ish-rel-degree", size === "sm" && "ish-rel-degree-sm")}
      data-degree={degree}
      aria-label={`${degree} degree connection`}
    >
      {degree}
    </span>
  );
}

function ProfileAction({
  person,
  companyName,
  onMessage,
  featured,
}: {
  person: NetworkPerson;
  companyName: string;
  onMessage?: () => void;
  featured?: boolean;
}) {
  const isConnect = person.cta === "connect";
  const className = cn(
    "ish-rel-cta inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-bold transition-[background,box-shadow,transform] active:scale-[0.98]",
    featured && "min-h-10 w-full px-4 py-2.5 text-[13px] sm:w-auto",
    isConnect ? "ish-rel-cta-outline" : "ish-rel-cta-fill",
  );

  if (!isConnect && onMessage) {
    return (
      <button type="button" onClick={onMessage} className={className}>
        <Send className="size-3.5" />
        Message
      </button>
    );
  }

  return (
    <a href={profileHref(person, companyName)} target="_blank" rel="noreferrer" className={className}>
      {isConnect ? (
        <>
          <UserPlus className="size-3.5" />
          Connect
        </>
      ) : (
        <>
          <Send className="size-3.5" />
          Message
        </>
      )}
    </a>
  );
}

function ConnectionHero({
  person,
  companyName,
  onMessage,
}: {
  person: NetworkPerson;
  companyName: string;
  onMessage?: () => void;
}) {
  const role = roleLine(person, companyName);

  return (
    <article className="ish-rel-hero relative overflow-hidden rounded-[22px]">
      <div className="ish-rel-hero-accent pointer-events-none absolute inset-x-0 top-0 h-1" aria-hidden />
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-5 sm:p-5">
        <div className="flex min-w-0 items-start gap-3.5 sm:gap-4">
          <div className="ish-rel-avatar-ring shrink-0">
            <IshAvatar name={person.name} index={0} size={64} />
          </div>
          <div className="min-w-0 pt-0.5">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-ink-faint">
              Your connection
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="truncate text-[18px] font-bold leading-tight tracking-tight text-brand-ink sm:text-[20px]">
                {person.name}
              </h3>
              <DegreeBadge degree={person.degree} />
            </div>
            {role ? (
              <p className="ish-rel-snippet mt-1.5 text-[13px] leading-snug text-brand-ink-soft">{role}</p>
            ) : null}
            {companyName ? (
              <p className="mt-1 truncate text-[12px] font-semibold text-brand-ink-faint">{companyName}</p>
            ) : null}
            {person.relationship ? (
              <p className="mt-2 text-[12px] leading-snug text-brand-ink-soft">{person.relationship}</p>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 sm:pt-6">
          <ProfileAction person={person} companyName={companyName} onMessage={onMessage} featured />
        </div>
      </div>
    </article>
  );
}

function PersonRow({
  person,
  index,
  companyName,
}: {
  person: NetworkPerson;
  index: number;
  companyName: string;
}) {
  const role = roleLine(person, companyName);

  return (
    <div className="ish-rel-person flex flex-col gap-3 px-3.5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <IshAvatar name={person.name} index={index} size={44} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate text-[14px] font-bold leading-tight text-brand-ink">{person.name}</p>
            <DegreeBadge degree={person.degree} size="sm" />
          </div>
          {role ? (
            <p className="ish-rel-snippet mt-1 text-[12.5px] leading-snug text-brand-ink-soft">{role}</p>
          ) : null}
          {person.relationship ? (
            <p className="mt-0.5 truncate text-[11.5px] text-brand-ink-faint">{person.relationship}</p>
          ) : null}
        </div>
      </div>
      <ProfileAction person={person} companyName={companyName} />
    </div>
  );
}

function DegreeStat({ count, label }: { count: number; label: ConnectionDegree }) {
  return (
    <span className={cn("ish-rel-stat", count === 0 && "ish-rel-stat-zero")} data-degree={label}>
      <span className="tabular-nums">{count}</span>
      <span>{label}</span>
    </span>
  );
}

function PathNode({
  label,
  name,
  degree,
  index,
}: {
  label: string;
  name: string;
  degree?: ConnectionDegree;
  index: number;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-ink-faint">{label}</p>
      <div className="ish-rel-path-node flex items-center gap-2.5 rounded-[14px] px-2.5 py-2">
        <IshAvatar name={name} index={index} size={32} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-brand-ink">{name}</span>
        {degree ? <DegreeBadge degree={degree} size="sm" /> : null}
      </div>
    </div>
  );
}

function ConnectionMap({ graph }: { graph: NetworkGraph }) {
  const first = graph.people.filter((p) => p.degree === "1st");
  const connectors = graph.nodes.filter((n) => n.type === "connector");
  const steps: Array<{ key: string; node: ReactNode }> = [];

  if (connectors.length > 0) {
    steps.push({
      key: "team",
      node: (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-ink-faint">Team</p>
          <ul className="space-y-1.5">
            {connectors.map((c, i) => (
              <li key={c.id} className="ish-rel-path-node flex items-center gap-2.5 rounded-[14px] px-2.5 py-2">
                <IshAvatar name={c.name} index={i + 20} size={32} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-brand-ink">{c.name}</span>
              </li>
            ))}
          </ul>
        </div>
      ),
    });
  }

  if (first.length > 0) {
    steps.push({
      key: "first",
      node: (
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-ink-faint">
            1st degree at company
          </p>
          <ul className="space-y-1.5">
            {first.map((p, i) => (
              <li key={p.id} className="ish-rel-path-node flex items-center gap-2.5 rounded-[14px] px-2.5 py-2">
                <IshAvatar name={p.name} index={i + 8} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-brand-ink">{p.name}</p>
                  {p.connectorName ? (
                    <p className="truncate text-[11px] text-brand-ink-faint">{p.connectorName}</p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ),
    });
  }

  steps.push({
    key: "target",
    node: (
      <PathNode label="Target" name={graph.target.name} degree={graph.target.degree} index={0} />
    ),
  });

  return (
    <div className="space-y-0">
      {steps.map((step, i) => (
        <div key={step.key}>
          {step.node}
          {i < steps.length - 1 ? <div className="ish-rel-path-line" aria-hidden /> : null}
        </div>
      ))}
    </div>
  );
}

function PanelStatus({ children }: { children: ReactNode }) {
  return (
    <div className="ish-rel-panel px-4 py-10 sm:px-[22px] sm:py-14">
      <div className="ish-rel-empty mx-auto max-w-md rounded-[20px] px-6 py-10 text-center">{children}</div>
    </div>
  );
}

export function RelationshipAnalyticsPanel({ leadId, onMessageTarget }: Props) {
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
      <PanelStatus>
        <Loader2 className="mx-auto mb-3 size-5 animate-spin text-brand-ink-faint" />
        <p className="text-[13px] font-semibold text-brand-ink-soft">Loading relationship graph…</p>
      </PanelStatus>
    );
  }

  if (error || !graph) {
    return (
      <PanelStatus>
        <p className="text-[14px] font-semibold text-brand-ink">{error ?? "No graph data"}</p>
      </PanelStatus>
    );
  }

  const { firstDegree, secondDegree, thirdDegree, hasLinkedInImport } = graph.summary;

  return (
    <div className="ish-rel-panel px-4 py-4 sm:px-[22px] sm:py-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,280px)] lg:items-start lg:gap-5">
        <div className="min-w-0 space-y-4">
          <ConnectionHero person={graph.target} companyName={graph.companyName} onMessage={onMessageTarget} />

          <section>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <h3 className="min-w-0 text-[14px] font-bold text-brand-ink">
                More people at {graph.companyName}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                <DegreeStat count={firstDegree} label="1st" />
                <DegreeStat count={secondDegree} label="2nd" />
                <DegreeStat count={thirdDegree} label="3rd" />
              </div>
            </div>

            {!hasLinkedInImport && (
              <p className="ish-rel-note mb-3 rounded-[14px] px-3.5 py-2.5 text-[12px] leading-snug text-brand-ink-soft">
                Import LinkedIn connections to unlock 1st and 2nd degree paths.{" "}
                <Link href="/settings?tab=integrations" className="font-semibold text-brand-ink underline-offset-2 hover:underline">
                  Set up LinkedIn
                </Link>
              </p>
            )}

            {graph.people.length === 0 ? (
              <div className="ish-rel-empty rounded-[20px] px-6 py-8 text-center">
                <UserPlus className="mx-auto mb-3 size-7 text-brand-ink-faint" />
                <p className="text-[14px] font-semibold text-brand-ink">No other profiles yet</p>
                <p className="mx-auto mt-1 max-w-sm text-[12px] leading-snug text-brand-ink-soft">
                  Add CRM contacts at this company or import Connections.csv to discover people nearby.
                </p>
              </div>
            ) : (
              <div className="ish-rel-people overflow-hidden rounded-[20px]">
                {graph.people.map((person, i) => (
                  <PersonRow key={person.id} person={person} index={i + 1} companyName={graph.companyName} />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="ish-rel-path h-fit rounded-[20px] p-4">
          <div className="mb-4 flex items-center gap-2.5">
            <div className="ish-rel-path-icon flex size-8 items-center justify-center rounded-[10px]">
              <Waypoints className="size-3.5 text-brand-ink" />
            </div>
            <h3 className="text-[14px] font-bold text-brand-ink">How you&apos;re connected</h3>
          </div>
          <ConnectionMap graph={graph} />
          <p className="mt-4 text-[10px] leading-snug text-brand-ink-faint">
            Computed {new Date(graph.summary.lastComputedAt).toLocaleString()}
          </p>
        </aside>
      </div>
    </div>
  );
}
