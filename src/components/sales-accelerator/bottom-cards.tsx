import { GitBranch, MoreHorizontal, Plus, RefreshCw, Search } from "lucide-react";
import { CircleButton, IshAvatar, PanelCard, SectionHeader } from "@/design-system";

type Network = { name: string; email: string };

type Props = {
  record: {
    giftingIntelligence?: string;
    network: Network[];
  };
};

export function BottomCards({ record }: Props) {
  return (
    <>
      <PanelCard tone="pink">
        <SectionHeader title="Gifting Intelligence" size="card" className="mb-3" />
        <div className="text-[12.5px] leading-relaxed text-ish-ink-soft">
          {record.giftingIntelligence || "No intelligence gathered yet. Researcher will populate this."}
        </div>
      </PanelCard>
      <PanelCard tone="yellow">
        <SectionHeader
          title="Timeline"
          size="card"
          className="mb-3"
          actions={
            <div className="flex gap-1.5">
              <CircleButton size={26}><Plus className="size-3" /></CircleButton>
              <CircleButton size={26}><RefreshCw className="size-3" /></CircleButton>
              <CircleButton size={26}><MoreHorizontal className="size-3" /></CircleButton>
            </div>
          }
        />
        <div className="mb-2.5 flex items-center gap-2 rounded-xl bg-white/60 px-3.5 py-2 text-xs text-ish-ink-faint">
          <Search className="size-3.5" />
          Search Timeline
        </div>
        <div className="text-xs text-ish-ink-soft">No activity logged yet — sequence starts on first contact.</div>
      </PanelCard>
      <PanelCard tone="green">
        <SectionHeader
          title="Who Knows Whom"
          size="card"
          className="mb-3.5"
          actions={<CircleButton size={26}><GitBranch className="size-3" /></CircleButton>}
        />
        {record.network.length === 0 ? (
          <div className="text-[12px] text-ish-ink-faint">No network data yet.</div>
        ) : record.network.map((person, i) => (
          <div key={person.name} className="mb-2.5 flex items-center gap-2.5">
            <IshAvatar name={person.name} index={i + 1} size={34} />
            <div className="flex-1">
              <div className="text-[13px] font-bold text-ish-ink">{person.name}</div>
              <div className="text-[11px] text-ish-ink-faint">{person.email}</div>
            </div>
            <span className="flex gap-0.5">
              {[1, 2, 3, 4].map((n) => (
                <span key={n} className="size-1 rounded-full bg-ish-green" />
              ))}
            </span>
          </div>
        ))}
      </PanelCard>
    </>
  );
}
