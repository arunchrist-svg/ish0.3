import { describe, expect, it } from "vitest";
import type { LeadQueueItem } from "@/lib/api-client";
import {
  classifyLeadEmail,
  filterLeadsByFilters,
  parseLeadQueueSort,
  sortLeadsQueue,
  togglePanelFilter,
  toggleQuickFilter,
} from "@/lib/leads/lead-filters";

function lead(partial: Partial<LeadQueueItem> & { id: string; name: string }): LeadQueueItem {
  return {
    title: "HR",
    company: "Acme",
    city: "Bengaluru",
    score: 60,
    status: "scouted",
    action: "Awaiting research",
    emailStatus: "unverified",
    ...partial,
  };
}

describe("classifyLeadEmail", () => {
  it("treats gmail as personal", () => {
    expect(classifyLeadEmail(lead({ id: "1", name: "A", email: "priya@gmail.com" }))).toBe("personal");
  });

  it("treats info@ as generic", () => {
    expect(classifyLeadEmail(lead({ id: "1", name: "A", email: "info@acme.com" }))).toBe("generic");
  });

  it("treats named company email as business", () => {
    expect(classifyLeadEmail(lead({ id: "1", name: "A", email: "priya.sharma@acme.com" }))).toBe("business");
  });

  it("treats blank as missing", () => {
    expect(classifyLeadEmail(lead({ id: "1", name: "A", emailStatus: "missing" }))).toBe("missing");
  });
});

describe("filterLeadsByFilters", () => {
  const leads = [
    lead({
      id: "biz",
      name: "Biz",
      email: "priya@acme.com",
      status: "researched",
      score: 82,
      phone: "9876543210",
    }),
    lead({
      id: "gmail",
      name: "Gmail",
      email: "priya@gmail.com",
      status: "draft_ready",
    }),
    lead({
      id: "sent",
      name: "Sent",
      email: "hr@acme.com",
      status: "outreached",
      emailStatus: "generic",
    }),
    lead({
      id: "replied",
      name: "Replied",
      email: "ceo@acme.com",
      status: "replied",
    }),
  ];

  it("matches ready to write as contact ready + business email", () => {
    const result = filterLeadsByFilters(leads, { quick: "ready_to_write", panel: new Set(), addedByUserId: null });
    expect(result.map((l) => l.id)).toEqual(["biz"]);
  });

  it("matches ready to send", () => {
    const result = filterLeadsByFilters(leads, { quick: "ready_to_send", panel: new Set(), addedByUserId: null });
    expect(result.map((l) => l.id)).toEqual(["gmail"]);
  });

  it("ANDs quick preset with panel filters", () => {
    const result = filterLeadsByFilters(leads, {
      quick: "has_mobile",
      panel: new Set(["high_score"]),
      addedByUserId: null,
    });
    expect(result.map((l) => l.id)).toEqual(["biz"]);
  });

  it("filters personal email from the panel", () => {
    const result = filterLeadsByFilters(leads, {
      quick: null,
      panel: new Set(["personal_email"]),
      addedByUserId: null,
    });
    expect(result.map((l) => l.id)).toEqual(["gmail"]);
  });

  it("ORs multiple email type filters in the panel", () => {
    const result = filterLeadsByFilters(leads, {
      quick: null,
      panel: new Set(["business_email", "personal_email"]),
      addedByUserId: null,
    });
    expect(result.map((l) => l.id).sort()).toEqual(["biz", "gmail", "replied"]);
  });

  it("filters by added-by user id", () => {
    const withUsers = [
      lead({ id: "mine", name: "Mine", createdByUserId: "user-a" }),
      lead({ id: "theirs", name: "Theirs", createdByUserId: "user-b" }),
    ];
    const result = filterLeadsByFilters(withUsers, {
      quick: null,
      panel: new Set(),
      addedByUserId: "user-a",
    });
    expect(result.map((l) => l.id)).toEqual(["mine"]);
  });
});

describe("togglePanelFilter", () => {
  it("allows multiple email types", () => {
    let active = togglePanelFilter(new Set(), "business_email");
    active = togglePanelFilter(active, "personal_email");
    expect([...active].sort()).toEqual(["business_email", "personal_email"]);
  });

  it("toggles independent quality filters", () => {
    let active = togglePanelFilter(new Set(), "high_score");
    active = togglePanelFilter(active, "pinned");
    expect(active.has("high_score")).toBe(true);
    expect(active.has("pinned")).toBe(true);
  });
});

describe("toggleQuickFilter", () => {
  it("clears when the same pill is tapped again", () => {
    expect(toggleQuickFilter("replied", "replied")).toBeNull();
    expect(toggleQuickFilter("replied", "has_mobile")).toBe("has_mobile");
  });
});

describe("sortLeadsQueue", () => {
  const leads = [
    lead({ id: "a", name: "Alpha", score: 40, createdAt: "2026-01-01T00:00:00.000Z" }),
    lead({ id: "b", name: "Beta", score: 90, createdAt: "2026-03-01T00:00:00.000Z" }),
    lead({ id: "c", name: "Gamma", score: 70, createdAt: "2026-02-01T00:00:00.000Z" }),
  ];

  it("sorts by score descending", () => {
    expect(sortLeadsQueue(leads, "score").map((l) => l.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts date newest first", () => {
    expect(sortLeadsQueue(leads, "date_newest").map((l) => l.id)).toEqual(["b", "c", "a"]);
  });

  it("sorts date oldest first", () => {
    expect(sortLeadsQueue(leads, "date_oldest").map((l) => l.id)).toEqual(["a", "c", "b"]);
  });

  it("parses stored sort values", () => {
    expect(parseLeadQueueSort("date")).toBe("date_newest");
    expect(parseLeadQueueSort("date_oldest")).toBe("date_oldest");
    expect(parseLeadQueueSort("score")).toBe("score");
  });
});
