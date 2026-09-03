"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageCircle, Sparkles } from "lucide-react";
import { text } from "@/design-system/tokens";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatCreditCost } from "@/lib/billing/credit-costs";
import { formatWhatsAppDisplay } from "@/lib/whatsapp/click-url";
import { sanitizePhone } from "@/lib/enrichment/validate-contact";
import { usePermissions } from "@/hooks/use-permissions";
import {
  openWhatsAppOutreach,
  runWhatsAppWriter,
  updateOutreachDraft,
  type LeadDetailRecord,
  type WriterDraft,
} from "@/lib/api-client";

type Props = {
  lead: LeadDetailRecord;
  onDraftUpdated: (draft: WriterDraft) => void;
  onSent?: () => void;
};

export function WhatsAppTabPanel({ lead, onDraftUpdated, onSent }: Props) {
  const { canWritePipeline: canWrite } = usePermissions();
  const [draft, setDraft] = useState<WriterDraft | undefined>(lead.whatsappDraft);
  const [body, setBody] = useState(lead.whatsappDraft?.whatsapp ?? "");
  const [generating, setGenerating] = useState(false);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const displayPhone = formatWhatsAppDisplay(lead.phone);
  const hasMobile = Boolean(sanitizePhone(lead.phone));
  const canCompose = hasMobile;
  const trimmed = body.trim();

  useEffect(() => {
    setDraft(lead.whatsappDraft);
    if (!dirty) setBody(lead.whatsappDraft?.whatsapp ?? "");
  }, [lead.whatsappDraft, lead.id, dirty]);

  useEffect(() => {
    if (!dirty || !draft?.id) return;
    const timer = window.setTimeout(() => {
      void saveDraft();
    }, 600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body, dirty, draft?.id]);

  async function saveDraft() {
    if (!draft?.id) return;
    setSaving(true);
    try {
      await updateOutreachDraft({ leadOutreachId: draft.id, whatsapp: body });
      const next = { ...draft, whatsapp: body };
      setDraft(next);
      onDraftUpdated(next);
      setDirty(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save WhatsApp draft");
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerate() {
    if (!canWrite || generating || !canCompose) return;
    setGenerating(true);
    try {
      const next = await runWhatsAppWriter(lead.id);
      setDraft(next);
      setBody(next.whatsapp ?? "");
      setDirty(false);
      onDraftUpdated(next);
      toast.success("WhatsApp draft ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not write WhatsApp");
    } finally {
      setGenerating(false);
    }
  }

  async function handleOpen() {
    if (!canWrite || opening || !canCompose || !trimmed) return;
    setOpening(true);
    try {
      if (dirty && draft?.id) await saveDraft();
      if (!draft?.id) {
        toast.error("Generate a WhatsApp draft first");
        return;
      }
      const result = await openWhatsAppOutreach(draft.id);
      const opened = window.open(result.url, "_blank", "noopener,noreferrer");
      if (!opened) window.location.href = result.url;
      toast.success("Opened WhatsApp. Send from the chat to complete the message.");
      onSent?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open WhatsApp");
    } finally {
      setOpening(false);
    }
  }

  if (!hasMobile) {
    return (
      <div className="px-4 py-10 text-center lg:px-[22px]">
        <MessageCircle className="mx-auto mb-3 size-8 text-brand-ink-faint" />
        <h3 className={cn(text.cardTitle, "mb-1")}>No mobile number</h3>
        <p className="mx-auto max-w-sm text-[13px] text-brand-ink-soft">
          Add a mobile number on this lead to send WhatsApp.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 lg:px-[22px] lg:py-[18px]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-brand-ink-soft">
          To <span className="font-semibold text-brand-ink">{displayPhone}</span>
          {saving ? <span className="ml-2 text-brand-ink-faint">Saving…</span> : null}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!canWrite || generating}
            onClick={() => void handleGenerate()}
            className="inline-flex h-7 items-center gap-1 rounded-full bg-brand-black px-3 text-[11px] font-semibold text-white hover:bg-brand-black/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {generating ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
            {draft ? "Regenerate" : "Generate WhatsApp"}
            <span className="font-medium opacity-70">· {formatCreditCost("writer.draft")}</span>
          </button>
          <button
            type="button"
            disabled={!canWrite || opening || generating || !trimmed || !draft?.id}
            onClick={() => void handleOpen()}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-brand-border bg-white px-3 text-[11px] font-semibold text-brand-ink hover:bg-brand-canvas disabled:cursor-not-allowed disabled:opacity-40"
          >
            {opening ? <Loader2 className="size-3 animate-spin" /> : <MessageCircle className="size-3" />}
            Open WhatsApp
          </button>
        </div>
      </div>

      {generating && !trimmed ? (
        <div className="rounded-2xl border border-brand-border/50 bg-brand-canvas/60 px-4 py-10 text-center text-[13px] text-brand-ink-soft">
          Writing a WhatsApp draft for {lead.firstName}…
        </div>
      ) : (
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            setDirty(true);
          }}
          placeholder={draft ? "Edit the WhatsApp message" : "Generate a WhatsApp draft, then edit here"}
          disabled={!canWrite || generating}
          className={cn(
            text.body,
            "min-h-[16rem] w-full resize-y rounded-2xl border border-brand-stratus-blue/15 bg-white px-4 py-3 text-[13px] leading-[1.65] text-brand-ink placeholder:text-brand-ink-faint focus:outline-none focus:ring-2 focus:ring-brand-black/15 disabled:opacity-60",
          )}
        />
      )}
    </div>
  );
}
