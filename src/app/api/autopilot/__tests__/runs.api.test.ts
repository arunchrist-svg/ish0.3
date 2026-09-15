import { describe, expect, it, vi, beforeEach } from "vitest";

const startAutopilotRun = vi.fn();
const updateAutopilotRunSettings = vi.fn();

vi.mock("@/lib/agents/autopilot", () => ({
  startAutopilotRun: (...args: unknown[]) => startAutopilotRun(...args),
  updateAutopilotRunSettings: (...args: unknown[]) => updateAutopilotRunSettings(...args),
  removeAutopilotRun: vi.fn(),
}));

vi.mock("@/lib/agents/autopilot-store", () => ({
  listAutopilotRuns: vi.fn().mockResolvedValue([]),
  serializeAutopilotRun: (run: { id: string }) => run,
  getAutopilotRun: vi.fn(),
}));

vi.mock("@/lib/tenant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tenant")>();
  return {
    ...actual,
    requireTenantContext: vi.fn(),
  };
});

vi.mock("@/lib/auth/permissions", () => ({
  requirePipelineWrite: vi.fn(),
}));

import { POST } from "../../autopilot/runs/route";
import { PATCH } from "../../autopilot/runs/[id]/route";
import { requireTenantContext } from "@/lib/tenant";
import { getAutopilotRun } from "@/lib/agents/autopilot-store";

const ctx = {
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

describe("autopilot runs API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTenantContext).mockResolvedValue(ctx);
    startAutopilotRun.mockResolvedValue({
      id: "run-1",
      input: { cities: ["Hosur"], autoSend: true, outreachTemplate: "meet_online" },
    });
    updateAutopilotRunSettings.mockResolvedValue({
      id: "run-1",
      input: { cities: ["Hosur"], employeeBands: ["small"] },
    });
    vi.mocked(getAutopilotRun).mockResolvedValue({
      id: "run-1",
      tenantId: "tenant-1",
      workspaceId: "ws-1",
    } as never);
  });

  it("creates a workflow bot with schedule, template, and auto-send", async () => {
    const res = await POST(
      new Request("http://localhost/api/autopilot/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cities: ["Hosur"],
          industries: ["Manufacturing"],
          employeeBands: ["small"],
          seniority: ["Director"],
          departments: ["HR"],
          outreachTemplate: "meet_online",
          schedule: { daysOfWeek: [1, 2, 3, 4, 5], hour: 9, minute: 0, timezone: "Asia/Kolkata" },
          autoSend: true,
          runNow: false,
        }),
      }),
    );
    expect(res.status).toBe(201);
    expect(startAutopilotRun).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        cities: ["Hosur"],
        employeeBands: ["small"],
        outreachTemplate: "meet_online",
        autoSend: true,
        runNow: false,
      }),
    );
  });

  it("updates employee bands on PATCH", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/autopilot/runs/run-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeBands: ["medium"] }),
      }),
      { params: Promise.resolve({ id: "run-1" }) },
    );
    expect(res.status).toBe(200);
    expect(updateAutopilotRunSettings).toHaveBeenCalledWith(
      "run-1",
      expect.objectContaining({ employeeBands: ["medium"] }),
    );
  });
});
