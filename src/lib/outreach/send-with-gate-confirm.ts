import { QualityGateApiError, SenderPreflightApiError } from "@/lib/api-client";

export type SendGateOverrides = {
  overridePreflight?: boolean;
  overrideQualityGate?: boolean;
};

export function sendGateOverridesFromError(error: unknown): SendGateOverrides | null {
  if (error instanceof SenderPreflightApiError && error.canOverride) {
    return { overridePreflight: true, overrideQualityGate: true };
  }
  if (error instanceof QualityGateApiError && error.canOverride) {
    return { overrideQualityGate: true };
  }
  return null;
}

export function confirmCriticalSendOverride(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "This send is blocked by a quality or sender check.";
  return window.confirm(`${message}\n\nSend anyway? This override is recorded in the audit log.`);
}

export async function sendWithGateConfirm<T>(
  send: (overrides: SendGateOverrides) => Promise<T>,
): Promise<T> {
  try {
    return await send({});
  } catch (error) {
    const overrides = sendGateOverridesFromError(error);
    if (!overrides) throw error;
    if (!confirmCriticalSendOverride(error)) throw error;
    return await send(overrides);
  }
}
