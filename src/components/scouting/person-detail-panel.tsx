import { ExternalLink, Lock, Zap } from "lucide-react";
import type { Person } from "@/lib/scouting-data";
import { IshAvatar } from "@/design-system";
import { normalizeLinkedInUrl } from "@/lib/utils"
import { getScoreColor } from "@/design-system/tokens/colors";


type Props = { person: Person; index: number };

export function PersonDetailPanel({ person, index }: Props) {
  const linkedInUrl = normalizeLinkedInUrl(person.linkedIn);
  const scoreColor = getScoreColor(person.matchScore);

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto bg-white p-5">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start gap-3.5">
        <IshAvatar name={person.name} index={index} size={60} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[18px] font-bold leading-tight text-brand-ink">{person.name}</span>
            {person.isKeyDecisionMaker && (
              <span className="shrink-0 rounded-[5px] bg-brand-black px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white">
                KEY
              </span>
            )}
          </div>
          <div className="mt-1 text-[12.5px] font-medium text-brand-ink-soft leading-snug">
            {person.title}
          </div>
          <div className="mt-1 text-[11px] text-brand-ink-faint">
            {[person.department, person.seniority].filter(Boolean).join(" · ")}
          </div>
        </div>

        {/* Score pill */}
        <div
          className="flex shrink-0 flex-col items-center rounded-2xl px-3 py-2"
          style={{ backgroundColor: `${scoreColor}15` }}
        >
          <span className="text-[22px] font-extrabold leading-none" style={{ color: scoreColor }}>
            {person.matchScore}
          </span>
          <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide" style={{ color: scoreColor, opacity: 0.7 }}>
            Match
          </span>
        </div>
      </div>

      {person.location ? (
        <div className="rounded-2xl bg-brand-canvas px-4 py-3 text-[12.5px] text-brand-ink-soft">
          <span className="font-semibold text-brand-ink">Location: </span>
          {person.location}
        </div>
      ) : null}

      {/* ── Bio ─────────────────────────────────────────────── */}
      {person.bio && (
        <div className="rounded-2xl bg-brand-canvas p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-ink-faint mb-2">
            Bio
          </p>
          <p className="text-[12.5px] leading-relaxed text-brand-ink-soft">{person.bio}</p>
        </div>
      )}

      {/* ── Engagement Signals ──────────────────────────────── */}
      {person.engagementSignals.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-widest text-brand-ink-faint">
              Engagement Signals
            </span>
            <Zap className="size-3.5 text-brand-green" />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
            {person.engagementSignals.map((signal, i) => (
              <span
                key={i}
                className="shrink-0 rounded-full bg-brand-green-soft px-3.5 py-1.5 text-[11.5px] font-medium text-brand-green"
              >
                {signal}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── LinkedIn ────────────────────────────────────────── */}
      {linkedInUrl && (
        <a
          href={linkedInUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-xl border border-brand-border bg-white px-4 py-2.5 text-[12.5px] font-semibold text-brand-ink transition-all hover:bg-brand-canvas active:scale-[0.98]"
        >
          <ExternalLink className="size-3.5 text-brand-ink-soft" />
          View LinkedIn Profile
        </a>
      )}

      {/* ── Contact ─────────────────────────────────────────── */}
      <div>
        <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-brand-ink-faint">
          Contact
        </p>
        <div className="overflow-hidden rounded-2xl border border-brand-border bg-white">
          {[
            { label: "Email", value: person.email },
            { label: "Phone", value: person.phone },
          ].map(({ label, value }, i, arr) => (
            <div
              key={label}
              className={`flex items-center gap-3 px-4 py-3 ${i < arr.length - 1 ? "border-b border-brand-border/60" : ""}`}
            >
              <span className="w-10 shrink-0 text-[11px] font-semibold text-brand-ink-faint">
                {label}
              </span>
              <span className="flex-1 select-none text-[13px] text-brand-ink blur-[3px] pointer-events-none">
                {value}
              </span>
              <Lock className="size-3.5 shrink-0 text-brand-ink-faint" />
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-[10.5px] text-brand-ink-faint">
          Unlocked on contact extraction
        </p>
      </div>
    </div>
  );
}
