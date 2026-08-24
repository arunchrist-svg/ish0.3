import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/email/sender-dns", async () => {
  const actual = await vi.importActual<typeof import("@/lib/email/sender-dns")>("@/lib/email/sender-dns");
  return {
    ...actual,
    checkDomainAuth: vi.fn(),
    isPersonalInboxDomain: vi.fn(() => false),
  };
});

vi.mock("@/lib/email/sender-volume", () => ({
  countSendsLast24h: vi.fn(),
  countSendsInRange: vi.fn(),
}));

vi.mock("@/lib/email/sender-bounce-rate", () => ({
  getWorkspaceBounceStats: vi.fn(),
}));

vi.mock("@/lib/settings/email-settings", () => ({
  setOutreachPaused: vi.fn().mockResolvedValue({}),
}));

import { checkDomainAuth } from "@/lib/email/sender-dns";
import { countSendsInRange, countSendsLast24h } from "@/lib/email/sender-volume";
import { getWorkspaceBounceStats } from "@/lib/email/sender-bounce-rate";
import { setOutreachPaused } from "@/lib/settings/email-settings";
import {
  assertSenderPreflight,
  runSenderHealthCheck,
  SenderPreflightError,
} from "@/lib/email/sender-preflight";
import type { EmailConfig } from "@/lib/email/config";

const baseConfig = {
  sendMode: "live",
  fromAddress: "hello@acme.com",
  dailySendCapPerDomain: 50,
  inboxWarmupStage: "trusted",
  dkimSelector: "google",
  outreachPaused: false,
} as EmailConfig;

const passAuth = {
  domain: "acme.com",
  status: "pass" as const,
  label: "Fully authenticated",
  passCount: 3,
  checks: {
    spf: { found: true, valid: true, record: "v=spf1 ~all" },
    dmarc: { found: true, valid: true, policy: "reject", hasRua: true },
    dkim: { found: true, valid: true, selector: "google" },
  },
};

describe("runSenderHealthCheck safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkDomainAuth).mockResolvedValue(passAuth);
    vi.mocked(countSendsLast24h).mockResolvedValue(10);
    vi.mocked(countSendsInRange).mockResolvedValue(10);
    vi.mocked(getWorkspaceBounceStats).mockResolvedValue({
      sent: 100,
      bounced: 1,
      rate: 0.01,
      windowHours: 168,
      threshold: 0.02,
      minSent: 20,
      exceedsThreshold: false,
    });
  });

  it("flags projected volume over daily cap", async () => {
    vi.mocked(countSendsLast24h).mockResolvedValue(48);
    const health = await runSenderHealthCheck(baseConfig, "ws-1", { projectedAdditional: 5 });
    expect(health.hasCritical).toBe(true);
    expect(health.issues.some((i) => i.id === "volume_cap")).toBe(true);
  });

  it("flags bounce rate and assert pauses outreach", async () => {
    vi.mocked(getWorkspaceBounceStats).mockResolvedValue({
      sent: 100,
      bounced: 5,
      rate: 0.05,
      windowHours: 168,
      threshold: 0.02,
      minSent: 20,
      exceedsThreshold: true,
    });

    await expect(assertSenderPreflight(baseConfig, "ws-1", { projectedAdditional: 1 })).rejects.toBeInstanceOf(
      SenderPreflightError,
    );
    expect(setOutreachPaused).toHaveBeenCalledWith(true, "ws-1");
  });

  it("hard-blocks when remaining quota is 0", async () => {
    vi.mocked(countSendsLast24h).mockResolvedValue(50);
    await expect(
      assertSenderPreflight(baseConfig, "ws-1", { projectedAdditional: 1, override: true }),
    ).rejects.toMatchObject({
      code: "SENDER_PREFLIGHT_FAILED",
      canOverride: false,
    });
  });

  it("lets the user confirm a burst above the new-inbox recommendation", async () => {
    const newInbox = {
      ...baseConfig,
      inboxWarmupStage: "new",
      dailySendCapPerDomain: 150,
    } as EmailConfig;
    vi.mocked(countSendsLast24h).mockResolvedValue(0);
    vi.mocked(countSendsInRange).mockResolvedValue(0);

    const blocked = await runSenderHealthCheck(newInbox, "ws-1", { projectedAdditional: 80 });
    expect(blocked.issues.some((i) => i.id === "warmup_recommend")).toBe(true);

    await expect(
      assertSenderPreflight(newInbox, "ws-1", { projectedAdditional: 80, override: true }),
    ).resolves.toMatchObject({ hasCritical: true });
  });
});
