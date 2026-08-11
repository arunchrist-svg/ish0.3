import Link from "next/link";
import { GitBranch } from "lucide-react";
import { CircleButton, IshAvatar, PanelCard, SectionHeader } from "@/design-system";
import type { ConnectionDegree } from "@/lib/network/degree";

type NetworkItem = {
  name: string;
  email?: string;
  linkedIn?: string;
  strength?: 1 | 2 | 3 | 4;
  degree?: ConnectionDegree;
  headline?: string;
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

function degreeFromItem(person: NetworkItem): ConnectionDegree | undefined {
  if (person.degree) return person.degree;
  if (person.strength && person.strength >= 4) return "1st";
  if (person.strength && person.strength >= 2) return "2nd";
  if (person.strength === 1) return "3rd";
  return undefined;
}

export function BottomCards({ record, onOpenAnalytics }: Props) {
  return (
    <>
      <PanelCard tone="pink">
        <SectionHeader title="Gifting Intelligence" size="card" className="mb-3" />
        <div className="text-[12.5px] leading-relaxed text-brand-ink-soft">
          {record.giftingIntelligence || "No intelligence gathered yet. Researcher will populate this."}
        </div>
      </PanelCard>
      <PanelCard tone="yellow">
        <SectionHeader title="Timeline" size="card" className="mb-3" />
        <div className="text-xs text-brand-ink-soft">No activity logged yet. Sequence starts on first contact.</div>
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
            <div className="text-[12px] text-brand-ink-faint">No network data yet.</div>
            <Link
              href="/settings?tab=integrations"
              className="inline-block text-[12px] font-semibold text-brand-green underline-offset-2 hover:underline"
            >
              Connect LinkedIn &amp; import connections
            </Link>
          </div>
        ) : (
          record.network.map((person, i) => {
            const degree = degreeFromItem(person);
            return (
              <div key={`${person.name}-${i}`} className="mb-2.5 flex items-center gap-2.5">
                <IshAvatar name={person.name} index={i + 1} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold text-brand-ink">
                    {person.name}
                    {degree ? (
                      <span className="font-semibold text-brand-ink-faint"> · {degree}</span>
                    ) : null}
                  </div>
                  <div className="truncate text-[11px] text-brand-ink-faint">
                    {person.headline || person.relationship || person.email || "—"}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </PanelCard>
    </>
  );
}
