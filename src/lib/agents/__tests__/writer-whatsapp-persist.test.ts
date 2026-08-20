import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  insertValues: vi.fn(),
  updateSet: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      leadOutreach: { findFirst: mocks.findFirst },
    },
    insert: () => ({
      values: (values: unknown) => {
        mocks.insertValues(values);
        return { returning: vi.fn().mockResolvedValue([{ id: "wa-1" }]) };
      },
    }),
    update: () => ({
      set: (values: unknown) => {
        mocks.updateSet(values);
        return { where: vi.fn().mockResolvedValue([]) };
      },
    }),
  },
  leadOutreach: {
    id: "id",
    leadId: "leadId",
    templateVariant: "templateVariant",
    createdAt: "createdAt",
  },
}));

import { persistWhatsAppDraft } from "../writer-whatsapp";
import { WHATSAPP_TEMPLATE_VARIANT } from "@/lib/whatsapp/outreach";

describe("persistWhatsAppDraft isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("inserts a whatsapp-only row and does not copy email sequence fields", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const id = await persistWhatsAppDraft({
      leadId: "lead-1",
      body: "Hi Priya, tasting sample this week?",
    });
    expect(id).toBe("wa-1");
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: "lead-1",
        templateVariant: WHATSAPP_TEMPLATE_VARIANT,
        sequencePosition: null,
        whatsapp: "Hi Priya, tasting sample this week?",
        emailBody: null,
        subjectA: null,
      }),
    );
  });

  it("updates the existing WhatsApp row instead of email drafts", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "wa-existing",
      templateVariant: WHATSAPP_TEMPLATE_VARIANT,
      draftSource: "llm",
      promptVersion: "v1.0-whatsapp",
    });
    const id = await persistWhatsAppDraft({
      leadId: "lead-1",
      body: "Updated WhatsApp copy",
    });
    expect(id).toBe("wa-existing");
    expect(mocks.insertValues).not.toHaveBeenCalled();
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        whatsapp: "Updated WhatsApp copy",
        templateVariant: WHATSAPP_TEMPLATE_VARIANT,
        sequencePosition: null,
      }),
    );
  });
});
