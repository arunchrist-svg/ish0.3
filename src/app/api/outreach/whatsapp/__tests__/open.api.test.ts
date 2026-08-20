import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  outreachFindFirst: vi.fn(),
  leadFindFirst: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  updateSet: vi.fn(),
  isWhatsAppConnected: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/tenant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tenant")>();
  return {
    ...actual,
    requireTenantContext: vi.fn(),
  };
});

vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    requirePipelineWrite: vi.fn(),
  };
});

vi.mock("@/lib/settings/whatsapp-settings", () => ({
  isWhatsAppConnected: (...args: unknown[]) => mocks.isWhatsAppConnected(...args),
}));

vi.mock("@/lib/audit", () => ({
  logAudit: (...args: unknown[]) => mocks.logAudit(...args),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      leadOutreach: { findFirst: mocks.outreachFindFirst },
      leads: { findFirst: mocks.leadFindFirst },
    },
    insert: () => ({
      values: (values: unknown) => {
        mocks.insertValues(values);
        return {
          returning: () => mocks.insertReturning(values),
        };
      },
    }),
    update: () => ({
      set: (values: unknown) => {
        mocks.updateSet(values);
        return { where: vi.fn().mockResolvedValue([]) };
      },
    }),
  },
  outreachApprovals: {},
  leadOutreach: { id: "id" },
  leads: { id: "id" },
  contacts: {},
  outreachSchedule: {},
  yieldFunnel: {},
}));

import { POST } from "../open/route";
import { requireTenantContext } from "@/lib/tenant";

const tenantCtx = {
  userId: "user-1",
  tenantId: "tenant-1",
  workspaceId: "ws-1",
  role: "owner" as const,
  platformRole: "user",
  isSuperadmin: false,
  onboardingStatus: "complete",
  onboardingStep: 5,
  demoMode: true,
  tenantSlug: "test",
  mustChangePassword: false,
};

describe("POST /api/outreach/whatsapp/open", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantContext).mockResolvedValue(tenantCtx);
    mocks.isWhatsAppConnected.mockResolvedValue(true);
    mocks.outreachFindFirst.mockResolvedValue({
      id: "wa-1",
      leadId: "lead-1",
      templateVariant: "whatsapp",
      whatsapp: "Hi Priya, tasting sample this week?",
    });
    mocks.leadFindFirst.mockResolvedValue({
      id: "lead-1",
      tenantId: "tenant-1",
      status: "researched",
      contact: { phone: "9845012345" },
    });
    mocks.insertReturning.mockImplementation((values: { channel?: string }) => {
      if (values.channel === "whatsapp" && !("sequenceDay" in (values as object))) {
        return Promise.resolve([{ id: "appr-1" }]);
      }
      return Promise.resolve([{ id: "sched-1" }]);
    });
  });

  it("returns 400 when WhatsApp is not connected", async () => {
    mocks.isWhatsAppConnected.mockResolvedValue(false);
    const res = await POST(
      new Request("http://localhost/api/outreach/whatsapp/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadOutreachId: "wa-1" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("WHATSAPP_NOT_CONNECTED");
  });

  it("returns 400 when the lead has no valid mobile", async () => {
    mocks.leadFindFirst.mockResolvedValue({
      id: "lead-1",
      tenantId: "tenant-1",
      status: "researched",
      contact: { phone: "123" },
    });
    const res = await POST(
      new Request("http://localhost/api/outreach/whatsapp/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadOutreachId: "wa-1" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("MOBILE_REQUIRED");
  });

  it("returns 400 when the draft body is empty", async () => {
    mocks.outreachFindFirst.mockResolvedValue({
      id: "wa-1",
      leadId: "lead-1",
      templateVariant: "whatsapp",
      whatsapp: "  ",
    });
    const res = await POST(
      new Request("http://localhost/api/outreach/whatsapp/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadOutreachId: "wa-1" }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("WHATSAPP_EMPTY_DRAFT");
  });

  it("returns a wa.me url and logs channel whatsapp", async () => {
    const res = await POST(
      new Request("http://localhost/api/outreach/whatsapp/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadOutreachId: "wa-1" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toMatch(/^https:\/\/wa\.me\/919845012345\?text=/);
    expect(body.to).toBe("+919845012345");
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "whatsapp", status: "approved" }),
    );
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "whatsapp",
        status: "sent",
        recipientPhone: "+919845012345",
      }),
    );
    expect(mocks.updateSet).toHaveBeenCalledWith({ status: "outreached" });
  });
});
