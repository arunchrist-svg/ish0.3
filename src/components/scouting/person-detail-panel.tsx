import { ExternalLink, Lock, Zap } from "lucide-react";
import type { Person } from "@/lib/scouting-data";
import { IshAvatar, ScoreBadge, PanelCard, SectionHeader, Button } from "@/design-system";

type Props = { person: Person; index: number };

export function PersonDetailPanel({ person, index }: Props) {
  return (
    <PanelCard tone="white" className="flex h-full flex-col gap-4 overflow-y-auto rounded-none p-5">
      {/* Header: avatar + name + KEY + score */}
      <div className="flex items-start gap-3">
        <IshAvatar name={person.name} index={index} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[17px] font-bold text-ish-ink">{person.name}</span>
            {person.isKeyDecisionMaker && (
              <span className="shrink-0 rounded-[5px] bg-ish-black px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white">
                KEY
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[12px] text-ish-ink-soft">{person.title}</div>
          <div className="mt-0.5 text-[11px] text-ish-ink-faint">
            {person.department} · {person.seniority}
          </div>
        </div>
        <ScoreBadge score={person.matchScore} />
      </div>

      {/* Bio — PanelCard tone="yellow" */}
      <PanelCard tone="yellow" className="p-4">
        <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-ish-ink-faint">
          Bio
        </div>
        <p className="text-[12.5px] leading-relaxed text-ish-ink-soft">{person.bio}</p>
      </PanelCard>

      {/* Engagement signals */}
      <div>
        <SectionHeader
          title="Engagement Signals"
          size="card"
          className="mb-2"
          actions={<Zap className="size-3.5 text-ish-green" />}
        />
        <div className="flex flex-col gap-1.5">
          {person.engagementSignals.map((signal, i) => (
            <div
              key={i}
              className="rounded-full bg-ish-green-soft px-3 py-1.5 text-[11.5px] font-medium text-ish-green"
            >
              {signal}
            </div>
          ))}
        </div>
      </div>

      {/* LinkedIn — Button variant="outline" size="sm" */}
      <a
        href={`https://${person.linkedIn}`}
        target="_blank"
        rel="noopener noreferrer"
        className="w-full"
      >
        <Button variant="outline" size="sm" className="w-full justify-start gap-2">
          <ExternalLink className="size-3.5" />
          View LinkedIn Profile
        </Button>
      </a>

      {/* Blurred contact fields */}
      <div>
        <SectionHeader title="Contact" size="card" className="mb-2" />
        <div className="flex flex-col gap-2">
          {[
            { label: "Email", value: person.email },
            { label: "Phone", value: person.phone },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="relative flex items-center gap-2.5 overflow-hidden rounded-[12px] border border-ish-border bg-white px-3.5 py-2.5"
            >
              <span className="w-10 shrink-0 text-[11px] font-semibold text-ish-ink-faint">
                {label}
              </span>
              <span className="flex-1 select-none text-[13px] blur-[3px] pointer-events-none text-ish-ink">
                {value}
              </span>
              <Lock className="size-3.5 shrink-0 text-ish-ink-faint" />
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-[10.5px] text-ish-ink-faint">
          Unlocked on contact extraction
        </p>
      </div>
    </PanelCard>
  );
}
