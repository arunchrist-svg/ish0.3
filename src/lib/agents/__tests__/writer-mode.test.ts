import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  leadFindFirst: vi.fn(),
  researchFindFirst: vi.fn(),
  insert: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  update: vi.fn(),
  ensureWriterPlan: vi.fn(),
  fillIshDraftVariants: vi.fn(),
  callLLM: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      leads: { findFirst: mocks.leadFindFirst },
      leadResearch: { findFirst: mocks.researchFindFirst },
    },
    insert: mocks.insert,
    update: () => ({ set: () => ({ where: mocks.update }) }),
  },
  leadOutreach: {},
  leads: { id: "id", status: "status" },
  contacts: {},
  accounts: {},
  leadResearch: { leadId: "leadId" },
  yieldFunnel: {},
}));

vi.mock("@/lib/settings/email-settings", () => ({
  getResolvedEmailConfig: vi.fn().mockResolvedValue({
    brandConfig: {
      brandSlug: "ish",
      brandName: "India Sweet House",
      vertical: "corporate_gifting",
      verticalPackId: "gifting-sweets",
      productSummary: "Premium mithai",
      websiteInsights: null,
      buyerPersonas: [],
    },
    campaignMode: "diwali",
    emailStyle: "formal",
    fromName: "Srilaksha",
    campaignNotes: "",
  }),
}));

vi.mock("@/lib/email/ish-cold-templates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email/ish-cold-templates")>();
  return {
    ...actual,
    fillIshDraftVariants: (...args: unknown[]) => mocks.fillIshDraftVariants(...args),
  };
});

vi.mock("@/lib/agents/writer-plan", () => ({
  ensureResearchBriefForWriter: vi.fn(),
  ensureWriterPlan: (...args: unknown[]) => mocks.ensureWriterPlan(...args),
  formatWriterPlanForPrompt: () => "plan",
  getResearchQualityGaps: () => [],
}));

vi.mock("@/lib/rag", () => ({ retrieveRelevantRules: () => [] }));
vi.mock("@/lib/llm", () => ({ callLLM: (...args: unknown[]) => mocks.callLLM(...args) }));
vi.mock("@/lib/email/recent-subjects", () => ({
  fetchRecentSubjectsForWorkspace: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/push/notify-workspace", () => ({ notifyLeadEvent: vi.fn() }));
vi.mock("@/lib/email/feedback-hooks", () => ({ auditContentScored: vi.fn() }));
vi.mock("@/lib/agents/writer-scoring", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agents/writer-scoring")>();
  return {
    ...actual,
    scoreRubric: vi.fn().mockResolvedValue({}),
    scoreRubricTotal: vi.fn().mockReturnValue(90),
    scoreSpamMeter: vi.fn().mockReturnValue({ inboxScore: 92, ruleHits: [] }),
  };
});

import { resolveWriterMode, runWriter } from "@/lib/agents/writer";

const lead = {
  id: "lead-1",
  tenantId: "t1",
  workspaceId: "ws1",
  status: "contact_ready",
  contact: {
    firstName: "Priya",
    name: "Priya Sharma",
    title: "HR Head",
    enrichmentSource: null,
  },
  account: {
    name: "Acme Auto",
    industry: "auto",
    city: "Hosur",
    employees: 200,
    intelNotes: null,
    companyOverview: null,
  },
};

describe("writerMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.leadFindFirst.mockResolvedValue(lead);
    mocks.researchFindFirst.mockResolvedValue({
      outreachHook: "Diwali gifting for the plant and office",
      decisionChain: ["Priya Sharma"],
      confidenceTier: "high",
    });
    mocks.insertReturning.mockResolvedValue([{ id: "outreach-1" }]);
    mocks.insertValues.mockReturnValue({ returning: mocks.insertReturning });
    mocks.insert.mockReturnValue({ values: mocks.insertValues });
    mocks.fillIshDraftVariants.mockReturnValue({
      subjectA: "Send happiness this Diwali, Priya",
      subjectB: "A tasting box for Acme Auto",
      subjectC: "Festive gifting, Priya",
      emailBody: "Hi Priya,\n\nDiwali is when Acme Auto thanks employees and clients.\n\nThanks & Regards\nSrilaksha\nIndia Sweet House",
      emailBodyB: "Hi Priya,\n\nBody B\n",
      emailBodyC: "Hi Priya,\n\nBody C\n",
    });
  });

  it("resolves missing or unknown values to standard", () => {
    expect(resolveWriterMode(undefined)).toBe("standard");
    expect(resolveWriterMode("standard")).toBe("standard");
    expect(resolveWriterMode("ai")).toBe("ai");
    expect(resolveWriterMode("other")).toBe("standard");
  });

  it("uses ISH templates by default for gifting-sweets", async () => {
    const id = await runWriter("lead-1");
    expect(id).toBe("outreach-1");
    expect(mocks.fillIshDraftVariants).toHaveBeenCalled();
    expect(mocks.ensureWriterPlan).not.toHaveBeenCalled();
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        draftSource: "template",
        subjectA: "Send happiness this Diwali, Priya",
      }),
    );
  });

  it("uses ISH templates when writerMode is standard", async () => {
    await runWriter("lead-1", { writerMode: "standard" });
    expect(mocks.fillIshDraftVariants).toHaveBeenCalled();
    expect(mocks.ensureWriterPlan).not.toHaveBeenCalled();
  });

  it("skips persistIshTemplateDraft when writerMode is ai", async () => {
    mocks.ensureWriterPlan.mockRejectedValue(new Error("AI_PATH_HIT"));
    await expect(runWriter("lead-1", { writerMode: "ai" })).rejects.toThrow("AI_PATH_HIT");
    expect(mocks.fillIshDraftVariants).not.toHaveBeenCalled();
    expect(mocks.ensureWriterPlan).toHaveBeenCalledWith("lead-1", { llmProvider: "openrouter" });
  });

  it("calls OpenRouter for AI Writer emails", async () => {
    mocks.ensureWriterPlan.mockResolvedValue({
      hook: "Diwali gifting for the plant",
      valueProp: "Organic mithai from our dairy",
      cta: "Shall I send a tasting box?",
    });
    mocks.callLLM.mockRejectedValue(new Error("OPENROUTER_HIT"));
    await expect(runWriter("lead-1", { writerMode: "ai" })).rejects.toThrow("OPENROUTER_HIT");
    expect(mocks.insertValues).not.toHaveBeenCalled();
    expect(mocks.callLLM).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "openrouter" }),
    );
  });
});
