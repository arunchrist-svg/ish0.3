"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/design-system";
import { VoiceMicButton } from "@/components/mobile/voice-mic-button";

type CoachBeat = {
  topic: string;
  headline: string;
  coachLine: string;
  chips: string[];
  recommendedChip?: string;
};

type PreferenceTopic = "scout" | "leads" | "email" | "close";

type CoachResponse = {
  ok?: boolean;
  error?: string;
  beat?: CoachBeat;
  summary?: string;
  topicsCovered?: PreferenceTopic[];
  readyToFinish?: boolean;
  needsLocation?: boolean;
  nextStep?: number;
  applied?: boolean;
};

const TOPIC_LABELS: Record<PreferenceTopic, string> = {
  scout: "Scout targets",
  leads: "Lead roles",
  email: "First email ask",
  close: "Close motion",
};

const SETUP_FIELD =
  "ish-onboarding-field w-full rounded-xl border border-brand-border bg-brand-canvas px-4 py-3 text-[15px] text-brand-ink outline-none placeholder:text-brand-ink-faint focus:border-brand-stratus-blue focus:bg-white focus:ring-2 focus:ring-brand-stratus-blue/20";

const SETUP_CTA =
  "h-12 rounded-2xl text-[14px] font-bold text-white shadow-[var(--shadow-brand)] bg-brand-black hover:bg-brand-black/90 ring-1 ring-brand-stratus-blue/20";

type Props = {
  onComplete: (result: { needsLocation: boolean; nextStep?: number }) => void;
  onError?: (message: string) => void;
};

export function OnboardingPreferenceCoach({ onComplete, onError }: Props) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [beat, setBeat] = useState<CoachBeat | null>(null);
  const [summary, setSummary] = useState("");
  const [topicsCovered, setTopicsCovered] = useState<PreferenceTopic[]>([]);
  const [readyToFinish, setReadyToFinish] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const applyResponse = useCallback((data: CoachResponse) => {
    if (data.beat) setBeat(data.beat);
    if (typeof data.summary === "string") setSummary(data.summary);
    if (Array.isArray(data.topicsCovered)) setTopicsCovered(data.topicsCovered);
    if (typeof data.readyToFinish === "boolean") setReadyToFinish(data.readyToFinish);
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/onboarding/preference-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = (await res.json()) as CoachResponse;
        if (!res.ok) {
          const msg = data.error ?? "Could not start preference coach";
          setError(msg);
          onError?.(msg);
          return;
        }
        applyResponse(data);
      } catch {
        const msg = "Could not start preference coach";
        setError(msg);
        onError?.(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [applyResponse, onError]);

  async function sendTurn(body: Record<string, unknown>) {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding/preference-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as CoachResponse;
      if (!res.ok) {
        const msg = data.error ?? "Something went wrong";
        setError(msg);
        onError?.(msg);
        return;
      }
      applyResponse(data);
      setInput("");
      if (data.applied) {
        onComplete({
          needsLocation: Boolean(data.needsLocation),
          nextStep: data.nextStep,
        });
      }
    } catch {
      const msg = "Could not save your answer";
      setError(msg);
      onError?.(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function handleChip(chip: string) {
    void sendTurn({ chip });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || submitting) return;
    void sendTurn({ message: trimmed });
  }

  function handleApply() {
    void sendTurn({ finish: true });
  }

  const requiredTopics: PreferenceTopic[] = ["scout", "email", "close"];

  if (loading) {
    return (
      <div className="ish-onboarding-card flex min-h-[320px] items-center justify-center rounded-2xl border border-brand-border bg-white p-8">
        <Loader2 className="size-8 animate-spin text-brand-stratus-blue" />
      </div>
    );
  }

  return (
    <div className="ish-onboarding-card overflow-hidden rounded-2xl border border-brand-border bg-white">
      <div className="grid gap-0 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6 p-6 sm:p-8">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-stratus-blue">
              Playbook coach
            </p>
            <h2 className="text-lg font-semibold text-brand-ink">{beat?.headline ?? "Your sales playbook"}</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-brand-ink-soft">{beat?.coachLine}</p>
          </div>

          {beat?.chips?.length ? (
            <div className="space-y-2">
              <p className="text-[12px] font-semibold text-brand-ink">Recommended</p>
              <div className="flex flex-wrap gap-2">
                {beat.chips.map((chip) => {
                  const recommended = chip === beat.recommendedChip;
                  return (
                    <button
                      key={chip}
                      type="button"
                      disabled={submitting}
                      onClick={() => handleChip(chip)}
                      className={cn(
                        "rounded-full px-3.5 py-2 text-left text-[13px] font-semibold transition disabled:opacity-60",
                        recommended
                          ? "bg-brand-black text-white ring-2 ring-brand-stratus-blue/30"
                          : "bg-brand-app text-brand-ink-soft ring-1 ring-brand-border hover:text-brand-ink",
                      )}
                    >
                      {chip}
                      {recommended ? (
                        <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-white/70">
                          suggested
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block text-[12px] font-semibold text-brand-ink">Or say it in your own words</label>
            <div className="flex gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={2}
                disabled={submitting}
                placeholder="e.g. HR leaders in Karnataka, first email asks for a tasting, we close with a visit"
                className={cn(SETUP_FIELD, "min-h-[72px] flex-1 resize-none")}
              />
              <VoiceMicButton
                disabled={submitting}
                onTranscript={(text) => setInput((prev) => (prev ? `${prev} ${text}` : text))}
                className="shrink-0 self-end"
              />
            </div>
            <Button
              type="submit"
              disabled={submitting || !input.trim()}
              variant="outline"
              className="ish-onboarding-cta-outline h-11 rounded-2xl px-5 text-[13px] font-semibold"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : "Add to playbook"}
            </Button>
          </form>

          {error ? (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
          ) : null}

          <Button
            type="button"
            onClick={handleApply}
            disabled={submitting || !readyToFinish}
            className={cn("w-full", SETUP_CTA)}
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : readyToFinish ? (
              "Apply this playbook"
            ) : (
              "Confirm scout, email ask, and close to continue"
            )}
          </Button>
        </div>

        <aside className="border-t border-brand-border bg-brand-app/50 p-6 lg:border-l lg:border-t-0">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="size-4 text-brand-stratus-blue" />
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-brand-ink">Recap</p>
          </div>
          <p className="text-[14px] leading-relaxed text-brand-ink">
            {summary || "Your playbook builds here as you confirm each beat."}
          </p>
          <ul className="mt-5 space-y-2">
            {requiredTopics.map((topic) => {
              const done = topicsCovered.includes(topic);
              return (
                <li key={topic} className="flex items-start gap-2 text-[13px]">
                  <CheckCircle2
                    className={cn("mt-0.5 size-4 shrink-0", done ? "text-brand-stratus-blue" : "text-brand-ink-faint")}
                  />
                  <span className={done ? "font-medium text-brand-ink" : "text-brand-ink-soft"}>
                    {TOPIC_LABELS[topic]}
                  </span>
                </li>
              );
            })}
          </ul>
          {topicsCovered.includes("leads") ? (
            <p className="mt-4 text-[11px] text-brand-ink-faint">Lead roles saved for Writer ranking.</p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
