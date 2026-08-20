import { Check, ExternalLink, Globe, Lock, Pencil, X, Zap } from "lucide-react";
import { useState } from "react";
import type { Person } from "@/lib/scouting-data";
import { IshAvatar } from "@/design-system";
import { displayPersonTitle, isBlankPersonField, personLinkedInHref } from "@/lib/utils";
import { getScoreColor } from "@/design-system/tokens/colors";
import { LinkedInGlyph } from "@/components/icons/linkedin-glyph";
import { COMPANIES } from "@/lib/scouting-data";
import { displayCompanyWebsite, parsePastedCompanyWebsite } from "@/lib/enrichment/company-domain-quality";

function LeadWebsiteField({
  website,
  domain,
  onWebsiteResolved,
}: {
  website?: string;
  domain?: string;
  onWebsiteResolved?: (resolved: { domain?: string; website?: string }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const site = displayCompanyWebsite(domain, website);

  function handleSave() {
    if (!onWebsiteResolved) return;
    const parsed = parsePastedCompanyWebsite(draft);
    if (!parsed.domain) { setError("Use company.com, not Zauba or IndiaMART."); return; }
    onWebsiteResolved(parsed);
    setEditing(false);
    setError(null);
  }

  if (editing) {
    return (
      <form
        className="w-full"
        onSubmit={(e) => { e.preventDefault(); handleSave(); }}
      >
        <div className="flex gap-1">
          <input
            autoFocus
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setError(null); }}
            placeholder={site?.href ?? "https://company.com"}
            autoComplete="url"
            inputMode="url"
            className="h-7 min-w-0 flex-1 rounded-md border border-brand-border bg-white px-2 text-[11.5px] text-brand-ink outline-none placeholder:text-brand-ink-faint"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="flex size-7 items-center justify-center rounded-md bg-brand-ink text-white disabled:opacity-40"
            title="Save"
          >
            <Check className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setError(null); }}
            className="flex size-7 items-center justify-center rounded-md border border-brand-border bg-white text-brand-ink-soft hover:text-brand-ink"
            title="Cancel"
          >
            <X className="size-3.5" />
          </button>
        </div>
        {error ? <p className="mt-1 text-[10px] text-red-600">{error}</p> : null}
      </form>
    );
  }

  if (site) {
    return (
      <div className="flex w-full items-center gap-2 rounded-xl border border-brand-border bg-white px-4 py-2.5 text-[12.5px] font-semibold text-brand-ink">
        <Globe className="size-3.5 shrink-0 text-brand-ink-soft" />
        <a
          href={site.href}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1 truncate text-blue-600 hover:underline"
        >
          {site.label}
        </a>
        <ExternalLink className="size-3 shrink-0 text-brand-ink-faint" />
        {onWebsiteResolved ? (
          <button
            type="button"
            onClick={() => { setDraft(site.href); setEditing(true); }}
            className="flex size-5 shrink-0 items-center justify-center rounded text-brand-ink-faint hover:text-brand-ink"
            title="Edit website"
          >
            <Pencil className="size-3" />
          </button>
        ) : null}
      </div>
    );
  }

  if (onWebsiteResolved) {
    return (
      <button
        type="button"
        onClick={() => { setDraft(""); setEditing(true); }}
        className="flex w-full items-center gap-2 rounded-xl border border-dashed border-brand-border bg-white px-4 py-2.5 text-[12.5px] font-medium text-brand-ink-faint hover:border-brand-ink-soft hover:text-brand-ink-soft transition-colors"
      >
        <Globe className="size-3.5 shrink-0" />
        Add company website
      </button>
    );
  }

  return null;
}

type Props = {
  person: Person;
  index: number;
  companyName?: string;
  companyWebsite?: string;
  companyDomain?: string;
  onWebsiteResolved?: (resolved: { domain?: string; website?: string }) => void;
};

export function PersonDetailPanel({ person, index, companyName, companyWebsite, companyDomain, onWebsiteResolved }: Props) {
  const company = companyName ?? COMPANIES.find((c) => c.id === person.companyId)?.name;
  const linkedIn = personLinkedInHref({
    linkedIn: person.linkedIn,
    name: person.name,
    companyName: company,
  });
  const scoreColor = getScoreColor(person.matchScore);
  const roleLine = [person.department, person.seniority].filter((value) => !isBlankPersonField(value)).join(" · ");

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
            {displayPersonTitle(person.title)}
          </div>
          {roleLine ? (
            <div className="mt-1 text-[11px] text-brand-ink-faint">{roleLine}</div>
          ) : null}
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
      <a
        href={linkedIn.href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-xl border border-brand-border bg-white px-4 py-2.5 text-[12.5px] font-semibold text-brand-ink transition-all hover:bg-brand-canvas active:scale-[0.98]"
      >
        <LinkedInGlyph className="size-3.5 text-[#0A66C2]" />
        {linkedIn.hasProfile ? "View LinkedIn Profile" : "Find on LinkedIn"}
        <ExternalLink className="ml-auto size-3.5 text-brand-ink-soft" />
      </a>

      {/* ── Website ─────────────────────────────────────────── */}
      <LeadWebsiteField
        website={companyWebsite}
        domain={companyDomain}
        onWebsiteResolved={onWebsiteResolved}
      />

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
