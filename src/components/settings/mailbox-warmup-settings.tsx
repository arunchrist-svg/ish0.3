"use client";

import { SettingsGroup, SettingsGroupDivider, SettingsRow } from "@/components/settings/settings-group";
import { SettingsSegmented } from "@/components/settings/settings-segmented";
import type { EmailConfigResponse } from "@/lib/settings/email-settings";
import {
  defaultDailyCapForStage,
  INBOX_WARMUP_STAGE_OPTIONS,
  MAILBOX_WARMUP,
  recommendedDailyCap,
  warmupCapWarning,
  type InboxWarmupStage,
} from "@/lib/email/sender-warmup";

type Props = {
  config: EmailConfigResponse;
  onUpdate: <K extends keyof EmailConfigResponse>(key: K, value: EmailConfigResponse[K]) => void;
};

export function MailboxWarmupSettings({ config, onUpdate }: Props) {
  const stage = (config.inboxWarmupStage ?? "new") as InboxWarmupStage;
  const rec = recommendedDailyCap({
    stage,
    warmupStartedAt: config.inboxWarmupStartedAt,
  });
  const cap = config.dailySendCapPerDomain ?? rec.recommended;
  const warning = warmupCapWarning(cap, rec);

  function setStage(next: InboxWarmupStage) {
    onUpdate("inboxWarmupStage", next);
    if (next === "new" && !config.inboxWarmupStartedAt) {
      onUpdate("inboxWarmupStartedAt", new Date().toISOString());
    }
    onUpdate("dailySendCapPerDomain", defaultDailyCapForStage(next));
  }

  return (
    <SettingsGroup
      title="Mailbox warmup"
      footer="Same limits on every workspace. New inboxes: 20–40/day for 2–4 weeks. Warmed: 100–150/day. Raise volume gradually, not in one burst."
      className="mb-4"
    >
      <SettingsRow className="justify-between py-2.5">
        <span className="text-[13px] font-semibold text-brand-ink">Inbox age</span>
        <SettingsSegmented
          value={stage}
          onChange={setStage}
          options={INBOX_WARMUP_STAGE_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
      </SettingsRow>
      <p className="px-4 pb-2 text-[11px] leading-relaxed text-brand-ink-soft">
        {INBOX_WARMUP_STAGE_OPTIONS.find((option) => option.value === stage)?.desc} Recommended today:{" "}
        {rec.recommended}/day ({rec.min}–{rec.max}).
      </p>
      <SettingsGroupDivider />
      <div className="grid gap-3 px-4 py-3 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-brand-ink-faint">
            Daily send cap
          </span>
          <input
            type="number"
            min={1}
            max={MAILBOX_WARMUP.hardCapMax}
            value={String(cap)}
            onChange={(e) =>
              onUpdate(
                "dailySendCapPerDomain",
                Math.max(1, Math.min(MAILBOX_WARMUP.hardCapMax, Number(e.target.value) || rec.recommended)),
              )
            }
            className="ish-email-settings-input w-full rounded-xl border border-brand-stratus-blue/20 bg-white/80 px-3 py-2 text-[13px] text-brand-ink outline-none focus:border-brand-stratus-blue/45 focus:ring-2 focus:ring-brand-stratus-blue/12"
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => onUpdate("dailySendCapPerDomain", rec.recommended)}
            className="h-[38px] rounded-full border border-brand-stratus-blue/25 bg-white/80 px-3 text-[12px] font-semibold text-brand-ink-soft hover:text-brand-ink"
          >
            Use recommended ({rec.recommended})
          </button>
        </div>
      </div>
      {warning ? (
        <p className="px-4 pb-3 text-[12px] font-medium leading-relaxed text-[#c47a00]">{warning}</p>
      ) : (
        <p className="px-4 pb-3 text-[11px] leading-relaxed text-brand-ink-faint">
          Live send, sequences, and follow-ups stop when remaining quota is 0. A sudden burst still asks for
          confirm even if the cap allows it.
        </p>
      )}
    </SettingsGroup>
  );
}
