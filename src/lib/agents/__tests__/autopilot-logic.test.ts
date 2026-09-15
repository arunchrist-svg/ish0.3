import { describe, expect, it } from "vitest";
import {
  AUTOPILOT_OUTREACH_TEMPLATE,
  AUTOPILOT_SENDS_EMAIL,
  applyGuessedEmail,
  companyDedupeReason,
  decideAfterAutopilotChunk,
  guessPersonEmail,
  isAutopilotTavilyExhausted,
  mergeAutopilotProgress,
  planNextAutopilotChunk,
  resolveAutopilotPeopleFilters,
  autopilotExcludeNames,
  autopilotFocusIndustries,
  autopilotPeopleCities,
  autopilotPeopleSkipReason,
  shouldFillAutopilotChunk,
  planDailyAutopilotAction,
} from "@/lib/agents/autopilot-logic";

describe("planNextAutopilotChunk", () => {
  it("splits 12 remaining leads into 10 then 2", () => {
    expect(
      planNextAutopilotChunk({
        targetCompanies: 100,
        chunkSize: 10,
        companiesSaved: 0,
        targetLeads: 12,
        leadsSaved: 0,
      }),
    ).toBe(10);
    expect(
      planNextAutopilotChunk({
        targetCompanies: 100,
        chunkSize: 10,
        companiesSaved: 10,
        targetLeads: 12,
        leadsSaved: 10,
      }),
    ).toBe(2);
    expect(
      planNextAutopilotChunk({
        targetCompanies: 100,
        chunkSize: 10,
        companiesSaved: 12,
        targetLeads: 12,
        leadsSaved: 12,
      }),
    ).toBe(0);
  });

  it("keeps requesting chunks until 100 leads even if few companies saved", () => {
    expect(
      planNextAutopilotChunk({
        targetCompanies: 100,
        chunkSize: 10,
        companiesSaved: 8,
        targetLeads: 100,
        leadsSaved: 8,
      }),
    ).toBe(10);
    expect(
      planNextAutopilotChunk({
        targetCompanies: 100,
        chunkSize: 10,
        companiesSaved: 40,
        targetLeads: 100,
        leadsSaved: 100,
      }),
    ).toBe(0);
  });

  it("keeps filling a chunk until new leads are saved", () => {
    expect(
      shouldFillAutopilotChunk({
        leadsSavedThisChunk: 0,
        chunkSize: 10,
        discoveryPasses: 1,
        companiesTriedThisChunk: 10,
      }),
    ).toBe(true);
    expect(
      shouldFillAutopilotChunk({
        leadsSavedThisChunk: 10,
        chunkSize: 10,
        discoveryPasses: 1,
        companiesTriedThisChunk: 12,
      }),
    ).toBe(false);
    expect(
      shouldFillAutopilotChunk({
        leadsSavedThisChunk: 2,
        chunkSize: 10,
        discoveryPasses: 6,
        companiesTriedThisChunk: 12,
      }),
    ).toBe(false);
  });
});

describe("decideAfterAutopilotChunk", () => {
  const base = {
    enabled: true,
    tavilyExhausted: false,
    companiesDiscovered: 10,
    peopleFound: 8,
    allCompaniesDeduped: false,
    leadsSavedTotal: 8,
    targetLeads: 100,
    companiesSavedTotal: 8,
    targetCompanies: 100,
    chunkIndex: 0,
    chunkSize: 10,
  };

  it("pauses when the kill switch is off and does not enqueue writer or next chunk", () => {
    const decision = decideAfterAutopilotChunk({ ...base, enabled: false });
    expect(decision).toMatchObject({
      nextStatus: "paused",
      enqueueNext: false,
      enqueueWriter: false,
    });
  });

  it("pauses on credit error and keeps going later", () => {
    const decision = decideAfterAutopilotChunk({ ...base, creditError: true, leadsSavedTotal: 10 });
    expect(decision.nextStatus).toBe("paused");
    expect(decision.enqueueNext).toBe(false);
    expect(decision.enqueueWriter).toBe(false);
  });

  it("pauses on Tavily exhaustion and keeps earlier leads", () => {
    const decision = decideAfterAutopilotChunk({
      ...base,
      tavilyExhausted: true,
      leadsSavedTotal: 10,
    });
    expect(decision.nextStatus).toBe("paused");
    expect(decision.enqueueWriter).toBe(true);
    expect(decision.enqueueNext).toBe(false);
    expect(decision.error).toMatch(/credits ran out/i);
  });

  it("keeps running when a whole chunk finds companies but zero people", () => {
    const decision = decideAfterAutopilotChunk({
      ...base,
      peopleFound: 0,
      leadsSavedTotal: 0,
      companiesSavedTotal: 0,
      allCompaniesDeduped: false,
    });
    expect(decision).toMatchObject({
      nextStatus: "running",
      enqueueNext: true,
      enqueueWriter: false,
      nextChunkIndex: 1,
    });
  });

  it("keeps paging when this search page was all skips or empty", () => {
    const decision = decideAfterAutopilotChunk({
      ...base,
      peopleFound: 0,
      allCompaniesDeduped: true,
      companiesSavedTotal: 0,
      leadsSavedTotal: 0,
      emptyDiscoveryStreak: 1,
    });
    expect(decision.nextStatus).toBe("running");
    expect(decision.enqueueNext).toBe(true);
    expect(decision.nextChunkIndex).toBe(1);
  });

  it("keeps running on empty search pages while under 100 leads", () => {
    const decision = decideAfterAutopilotChunk({
      ...base,
      peopleFound: 0,
      companiesDiscovered: 0,
      leadsSavedTotal: 3,
      emptyDiscoveryStreak: 8,
    });
    expect(decision.nextStatus).toBe("running");
    expect(decision.enqueueNext).toBe(true);
    expect(decision.nextChunkIndex).toBe(1);
    expect(decision.error).toBeUndefined();
  });

  it("pauses after 30 empty pages as a credit backstop", () => {
    const decision = decideAfterAutopilotChunk({
      ...base,
      peopleFound: 0,
      companiesDiscovered: 0,
      leadsSavedTotal: 3,
      emptyDiscoveryStreak: 30,
    });
    expect(decision.nextStatus).toBe("paused");
    expect(decision.enqueueNext).toBe(false);
    expect(decision.error).toMatch(/credits/i);
  });

  it("moves to awaiting_approval at 100 leads", () => {
    const decision = decideAfterAutopilotChunk({ ...base, leadsSavedTotal: 100 });
    expect(decision.nextStatus).toBe("awaiting_approval");
    expect(decision.enqueueNext).toBe(false);
    expect(decision.enqueueWriter).toBe(true);
  });
});

describe("dedupe and email guess", () => {
  it("skips board, sequence, and same-company email this month", () => {
    expect(companyDedupeReason({ hasBoardLead: true })).toBe("already on the board");
    expect(companyDedupeReason({ hasActiveSequence: true })).toBe("active sequence");
    expect(companyDedupeReason({ emailedThisMonth: true })).toBe("emailed this company this month");
    expect(companyDedupeReason({})).toBeNull();
  });

  it("guesses name@domain when email is missing", () => {
    expect(
      guessPersonEmail(
        { name: "Anita Rao", email: undefined },
        { name: "Berger Paints", domain: "bergerpaints.com" },
      ),
    ).toMatch(/@bergerpaints\.com$/);
    expect(
      applyGuessedEmail(
        {
          name: "Anita Rao",
          emailStatus: "missing",
          dataSource: "tavily+llm",
        },
        { name: "Berger Paints", domain: "bergerpaints.com" },
      ).email,
    ).toBeTruthy();
  });
});

describe("tavily and defaults", () => {
  it("detects exhausted Tavily copy", () => {
    expect(isAutopilotTavilyExhausted(["All Tavily keys exhausted for people search."])).toBe(true);
    expect(isAutopilotTavilyExhausted(["Tavily keys are exhausted. Autopilot stopped."])).toBe(true);
    expect(isAutopilotTavilyExhausted(["Tavily is rate-limiting right now. Credits are still available."])).toBe(
      false,
    );
    expect(
      isAutopilotTavilyExhausted([
        "Apollo CREDITS_EXHAUSTED: Your team has used all of its credits for this billing cycle.",
      ]),
    ).toBe(false);
    expect(
      isAutopilotTavilyExhausted(["Tavily people search ran out of credits. Switched to Apollo."]),
    ).toBe(false);
  });

  it("defaults to suggested Manager/Director + HR/Procurement", () => {
    expect(resolveAutopilotPeopleFilters({})).toEqual({
      seniority: ["Manager", "Director"],
      departments: ["HR", "Procurement"],
    });
  });

  it("excludes skipped and attempted companies from the next chunk", () => {
    expect(
      autopilotExcludeNames({
        companyNames: ["AkzoNobel"],
        attemptedNames: ["Berger"],
        skipped: [{ name: "KASTURI ENTERPRISES", reason: "no decision-makers in plant or nearby HQ" }],
      }),
    ).toEqual(["AkzoNobel", "Berger", "KASTURI ENTERPRISES"]);
  });

  it("never marks Autopilot as a sender", () => {
    expect(AUTOPILOT_SENDS_EMAIL).toBe(false);
    expect(AUTOPILOT_OUTREACH_TEMPLATE).toBe("prasanth_sequence");
  });

  it("resumes unfinished daily bots and clones a finished 100-lead run", () => {
    expect(
      planDailyAutopilotAction([
        { id: "live", status: "running", leadsSaved: 12, targetLeads: 100 },
      ]),
    ).toEqual({ action: "skip_live" });
    expect(
      planDailyAutopilotAction([
        { id: "paused", status: "failed", leadsSaved: 0, targetLeads: 100 },
      ]),
    ).toEqual({ action: "resume", runId: "paused" });
    expect(
      planDailyAutopilotAction([
        { id: "ready", status: "awaiting_approval", leadsSaved: 100, targetLeads: 100 },
      ]),
    ).toEqual({ action: "start_new", sourceRunId: "ready" });
  });

  it("searches people in the company city, not all Autopilot chips", () => {
    expect(
      autopilotPeopleCities({ city: "Hosur" }, ["Bellary", "Bengaluru Rural", "Bengaluru"]),
    ).toEqual(["Hosur"]);
    expect(autopilotPeopleCities({ city: "India" }, ["Bellary"])).toEqual(["Bellary"]);
    expect(autopilotPeopleCities({}, ["Salem"])).toEqual(["Salem"]);
  });

  it("rotates three industries per city cycle", () => {
    const industries = [
      "Financial Services",
      "Technology",
      "Healthcare",
      "Retail",
      "Manufacturing",
      "Automotive",
    ];
    expect(autopilotFocusIndustries(industries, 0, 20)).toEqual([
      "Financial Services",
      "Technology",
      "Healthcare",
    ]);
    expect(autopilotFocusIndustries(industries, 20, 20)).toEqual([
      "Retail",
      "Manufacturing",
      "Automotive",
    ]);
  });

  it("does not treat a Places failover message as Tavily exhaustion", () => {
    expect(
      isAutopilotTavilyExhausted([
        "All Tavily keys exhausted. Switched to Google Places for company discovery.",
      ]),
    ).toBe(false);
    expect(autopilotPeopleSkipReason(["Tavily keys are exhausted. Autopilot stopped."])).toBe(
      "people search paused: Tavily credits ran out",
    );
  });
});

describe("mergeAutopilotProgress", () => {
  it("keeps chunk-1 leads when chunk 2 pauses", () => {
    const merged = mergeAutopilotProgress(
      {
        chunkIndex: 0,
        companiesSaved: 10,
        leadsSaved: 10,
        leadIds: ["lead-1"],
        companyNames: ["AkzoNobel"],
        skipped: [],
      },
      {
        chunkIndex: 1,
        newLeadIds: [],
        lastError: "Insufficient credits. Autopilot paused. Earlier leads are kept.",
      },
    );
    expect(merged.leadIds).toEqual(["lead-1"]);
    expect(merged.companyNames).toEqual(["AkzoNobel"]);
  });
});
