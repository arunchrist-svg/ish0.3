import { describe, expect, it } from "vitest";
import { memoryConversation } from "@/lib/agent/memory";

describe("agent memory", () => {
  it("keeps only validated conversation entries", () => {
    const entries = memoryConversation({
      conversation: {
        entries: [
          { role: "user", content: "Enrich this lead", at: "2026-08-27T00:00:00.000Z" },
          { role: "assistant", content: "Done", at: "2026-08-27T00:00:01.000Z" },
          { role: "unknown", content: "Ignore me", at: "2026-08-27T00:00:02.000Z" },
          { role: "tool", content: 42, at: "2026-08-27T00:00:03.000Z" },
        ],
      },
    });

    expect(entries).toHaveLength(2);
    expect(entries[0]?.role).toBe("user");
    expect(entries[1]?.role).toBe("assistant");
  });

  it("returns an empty history for malformed memory", () => {
    expect(memoryConversation({ conversation: null })).toEqual([]);
    expect(memoryConversation({})).toEqual([]);
  });
});
