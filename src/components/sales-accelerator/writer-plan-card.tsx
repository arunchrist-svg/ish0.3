"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Save } from "lucide-react";
import type { LeadDetailRecord, WriterPlan } from "@/lib/api-client";
import { regenerateLeadWriterPlan, updateLeadWriterPlan } from "@/lib/api-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VoiceMicButton } from "@/components/mobile/voice-mic-button";

type Props = {
  lead: LeadDetailRecord;
  onUpdated: () => void;
};

export function WriterPlanCard({ lead, onUpdated }: Props) {
  const plan = lead.research?.writerPlan;
  const [hook, setHook] = useState(plan?.hook ?? "");
  const [valueProp, setValueProp] = useState(plan?.valueProp ?? "");
  const [cta, setCta] = useState(plan?.cta ?? "");
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    setHook(plan?.hook ?? "");
    setValueProp(plan?.valueProp ?? "");
    setCta(plan?.cta ?? "");
  }, [plan?.hook, plan?.valueProp, plan?.cta, lead.id]);

  if (!lead.research) {
    return (
      <div className="mb-4 rounded-[16px] border border-ish-border/50 bg-ish-canvas/30 px-4 py-3 text-[12px] text-ish-ink-soft">
        Research brief pending. Writer plan will appear after research completes.
      </div>
    );
  }

  const dirty =
    hook !== (plan?.hook ?? "") || valueProp !== (plan?.valueProp ?? "") || cta !== (plan?.cta ?? "");

  async function handleSave() {
    setSaving(true);
    try {
      await updateLeadWriterPlan(lead.id, { hook, valueProp, cta });
      toast.success("Writer plan saved");
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save plan");
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const { writerPlan } = await regenerateLeadWriterPlan(lead.id);
      setHook(writerPlan.hook);
      setValueProp(writerPlan.valueProp);
      setCta(writerPlan.cta);
      toast.success("Writer plan regenerated");
      onUpdated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not regenerate plan");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="mb-4 rounded-[16px] border border-ish-border/60 bg-white p-4 shadow-[var(--shadow-ish-sm)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold text-ish-ink">Writer plan</h3>
          <p className="text-[11px] text-ish-ink-soft">
            Email 1 follows this hook, value, and CTA. Edit before drafting.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <VoiceMicButton
            size="sm"
            onTranscript={(text) => setHook((prev) => (prev ? `${prev} ${text}` : text))}
            disabled={regenerating || saving}
          />
          <button
            type="button"
            onClick={() => void handleRegenerate()}
            disabled={regenerating || saving}
            className="inline-flex items-center gap-1.5 rounded-full border border-ish-border px-3 py-1.5 text-[11px] font-semibold text-ish-ink hover:bg-ish-canvas disabled:opacity-50"
          >
            {regenerating ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
            Regenerate
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!dirty || saving || regenerating}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold text-white",
              dirty ? "bg-ish-black hover:bg-ish-black/90" : "bg-ish-ink-faint",
            )}
          >
            {saving ? <Loader2 className="size-3 animate-spin" /> : <Save className="size-3" />}
            Save
          </button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {(
          [
            ["Hook", hook, setHook, "Opening angle for email 1"],
            ["Value", valueProp, setValueProp, "Why gifting matters to them"],
            ["CTA", cta, setCta, "Soft ask for email 1"],
          ] as const
        ).map(([label, value, setter, placeholder]) => (
          <label key={label} className="block">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-ish-ink-soft">{label}</span>
            <textarea
              value={value}
              onChange={(e) => setter(e.target.value)}
              placeholder={placeholder}
              rows={3}
              className="w-full resize-y rounded-[12px] border border-ish-border/50 bg-ish-canvas/20 px-3 py-2 text-[12px] leading-relaxed text-ish-ink focus:border-ish-stratus-blue/40 focus:outline-none focus:ring-2 focus:ring-ish-stratus-blue/10"
            />
          </label>
        ))}
      </div>
      {plan?.source ? (
        <p className="mt-2 text-[10px] text-ish-ink-faint">Source: {plan.source === "user" ? "Edited by you" : "AI generated"}</p>
      ) : null}
    </div>
  );
}
