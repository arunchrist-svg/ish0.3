import type { EmailSendMode } from "@/lib/email/config";

export type OperationalSendState = "unconfigured" | EmailSendMode;

export function operationalSendState(params: {
  emailConfigured?: boolean;
  sendMode?: string | null;
}): OperationalSendState {
  if (params.emailConfigured === false) return "unconfigured";
  const mode = params.sendMode;
  if (mode === "live" || mode === "test" || mode === "dry_run") return mode;
  return "dry_run";
}

export function sendStateLabel(state: OperationalSendState): string {
  if (state === "unconfigured") return "Email not connected";
  if (state === "live") return "Live";
  if (state === "test") return "Test";
  return "Dry run";
}

/** True when outbound is not actually going to prospects. */
export function isNonLiveSendState(state: OperationalSendState): boolean {
  return state !== "live";
}
