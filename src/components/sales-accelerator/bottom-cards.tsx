import Link from "next/link";
import { GitBranch } from "lucide-react";
import { CircleButton, IshAvatar, PanelCard, SectionHeader } from "@/design-system";

type NetworkItem = {
  name: string;
  email?: string;
  linkedIn?: string;
  strength?: 1 | 2 | 3 | 4;
  relationship?: string;
  connectorName?: string;
  path?: string[];
};

type Props = {
  record: {
    giftingIntelligence?: string;
    network: NetworkItem[];
  };
  onOpenAnalytics?: () => void;
};

function StrengthDots({ strength = 1 }: { strength?: number }) {
  return (
    <span className="flex gap-0.5" title={`Strength ${strength}/4`}>
      {[1, 2, 3, 4].map((n) => (
        <span
          key={n}
          className={`size-1 rounded-full ${n <= strength ? "bg-ish-green" : "bg-ish-green/25"}`}
        />
      ))}
    </span>
  );
}

export function BottomCards({ record, onOpenAnalytics }: Props) {
  return (
    <>
      <PanelCard tone="pink">
        <SectionHeader title="Gifting Intelligence" size="card" className="mb-3" />
        <div className="text-[12.5px] leading-relaxed text-ish-ink-soft">
          {record.giftingIntelligence || "No intelligence gathered yet. Researcher will populate this."}
        </div>
      </PanelCard>
      <PanelCard tone="yellow">
        <SectionHeader title="Timeline" size="card" className="mb-3" />
        <div className="text-xs text-ish-ink-soft">No activity logged yet — sequence starts on first contact.</div>
      </PanelCard>
      <PanelCard tone="green">
        <SectionHeader
          title="Who Knows Whom"
          size="card"
          className="mb-3.5"
          actions={
            <CircleButton size={26} onClick={onOpenAnalytics}>
              <GitBranch className="size-3" />
            </CircleButton>
          }
        />
        {record.network.length === 0 ? (
          <div className="space-y-2">
            <div className="text-[12px] text-ish-ink-faint">No network data yet.</div>
            <Link
              href="/settings?tab=integrations"
              className="inline-block text-[12px] font-semibold text-ish-green underline-offset-2 hover:underline"
            >
              Connect LinkedIn &amp; import connections
            </Link>
          </div>
        ) : (
          record.network.map((person, i) => (
            <div key={`${person.name}-${i}`} className="mb-2.5 flex items-center gap-2.5">
              <IshAvatar name={person.name} index={i + 1} size={34} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold text-ish-ink">{person.name}</div>
                <div className="truncate text-[11px] text-ish-ink-faint">
                  {person.relationship ?? person.email ?? "—"}
                </div>
                {person.connectorName && person.connectorName !== "CRM" && (
                  <div className="truncate text-[10px] text-ish-ink-faint">via {person.connectorName}</div>
                )}
              </div>
              <StrengthDots strength={person.strength} />
            </div>
          ))
        )}
      </PanelCard>
    </>
  );
}
