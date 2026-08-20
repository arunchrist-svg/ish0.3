export class WhatsAppNotConnectedError extends Error {
  code = "WHATSAPP_NOT_CONNECTED" as const;

  constructor() {
    super("WhatsApp is not connected. Connect it in Settings → Integrations.");
    this.name = "WhatsAppNotConnectedError";
  }
}

export class WhatsAppMobileRequiredError extends Error {
  code = "MOBILE_REQUIRED" as const;

  constructor() {
    super("This lead has no valid mobile number. Add one to send WhatsApp.");
    this.name = "WhatsAppMobileRequiredError";
  }
}

export class WhatsAppEmptyDraftError extends Error {
  code = "WHATSAPP_EMPTY_DRAFT" as const;

  constructor() {
    super("WhatsApp message is empty");
    this.name = "WhatsAppEmptyDraftError";
  }
}

export const WHATSAPP_PRE_SEND_STATUSES = [
  "scouted",
  "prefiltered",
  "researched",
  "draft_ready",
  "approved",
] as const;

export function shouldAdvanceLeadFromWhatsApp(status: string): boolean {
  return (WHATSAPP_PRE_SEND_STATUSES as readonly string[]).includes(status);
}

export function shouldSetDraftReadyFromWhatsApp(status: string): boolean {
  return status === "scouted" || status === "prefiltered" || status === "researched";
}
