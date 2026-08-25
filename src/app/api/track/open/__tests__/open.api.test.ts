import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateSet: vi.fn(),
  logAudit: vi.fn(),
  scheduleCatalogOnOpenAfterOpen: vi.fn(),
  getDefaultEmailConfig: vi.fn(() => ({ appUrl: "https://app.example.com" })),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mocks.logAudit(...args),
}));

vi.mock("@/lib/email/promote-catalog-on-open", () => ({
  scheduleCatalogOnOpenAfterOpen: (...args: unknown[]) => mocks.scheduleCatalogOnOpenAfterOpen(...args),
}));

vi.mock("@/lib/email/config", () => ({
  getDefaultEmailConfig: () => mocks.getDefaultEmailConfig(),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      outreachSchedule: { findFirst: mocks.findFirst },
    },
    update: () => ({
      set: (values: unknown) => {
        mocks.updateSet(values);
        return { where: vi.fn().mockResolvedValue([]) };
      },
    }),
  },
  outreachSchedule: { trackingToken: "tracking_token", id: "id" },
}));

import { GET } from "../route";
import { OPEN_TRACKING_GRACE_MS } from "@/lib/email/open-tracking";

describe("GET /api/track/open", () => {
  const sentAt = new Date("2026-08-25T02:10:21.907Z");
  const row = {
    id: "sched-1",
    leadId: "lead-1",
    sequenceDay: 0,
    emailKind: "initial",
    approvalId: null,
    sendMode: "live",
    draftLeadOutreachId: null,
    status: "sent",
    sentAt,
    openedAt: null,
    trackingToken: "tok-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("ignores grace-window hits but sets short max-age so proxies re-fetch later", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(sentAt.getTime() + 7_690));
    mocks.findFirst.mockResolvedValue(row);

    const res = await GET(new Request("https://app.example.com/api/track/open?t=tok-1"));
    const remainingSec = Math.ceil((OPEN_TRACKING_GRACE_MS - 7_690) / 1000);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/gif");
    expect(res.headers.get("Cache-Control")).toBe(
      `private, max-age=${remainingSec}, must-revalidate`,
    );
    expect(mocks.updateSet).not.toHaveBeenCalled();
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "email.open_ignored",
        metadata: expect.objectContaining({ reason: "within_grace" }),
      }),
    );
  });

  it("records opens after grace with no-store headers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(sentAt.getTime() + OPEN_TRACKING_GRACE_MS + 5_000));
    mocks.findFirst.mockResolvedValue(row);
    mocks.scheduleCatalogOnOpenAfterOpen.mockResolvedValue(undefined);

    const res = await GET(
      new Request("https://app.example.com/api/track/open?t=tok-1", {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)",
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(res.headers.get("Expires")).toBe("0");
    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({ openedAt: expect.any(Date) }));
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "email.opened" }),
    );
  });
});
