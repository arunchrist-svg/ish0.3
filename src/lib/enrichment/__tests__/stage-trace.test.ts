import { describe, expect, it } from "vitest";
import {
  allProviderStepsEmpty,
  compactTrace,
  createStageTrace,
  firstZeroingStage,
  recordStage,
  setTraceProvider,
  summarizeTrace,
} from "@/lib/enrichment/stage-trace";

describe("recordStage", () => {
  it("derives dropped count and keeps stages in order", () => {
    const trace = createStageTrace();
    recordStage(trace, "apollo", 0, 16);
    recordStage(trace, "city_filter", 16, 0, "no verified city match");

    expect(trace.records).toEqual([
      { stage: "apollo", in: 0, out: 16, dropped: 0 },
      { stage: "city_filter", in: 16, out: 0, dropped: 16, reason: "no verified city match" },
    ]);
  });

  it("is a no-op when no trace is passed, so callers need no guard", () => {
    expect(() => recordStage(undefined, "apollo", 1, 1)).not.toThrow();
    expect(() => setTraceProvider(undefined, "apollo")).not.toThrow();
  });
});

describe("firstZeroingStage", () => {
  it("names the stage that emptied the pipeline", () => {
    const trace = createStageTrace();
    recordStage(trace, "india_directories", 0, 23);
    recordStage(trace, "city_filter", 23, 21);
    recordStage(trace, "industry_filter", 21, 0);

    expect(firstZeroingStage(trace)?.stage).toBe("industry_filter");
  });

  it("reports the last real zeroing stage, not the empty stages that follow it", () => {
    const trace = createStageTrace();
    recordStage(trace, "city_filter", 16, 0);
    recordStage(trace, "industry_filter", 0, 0);
    recordStage(trace, "llm_gate", 0, 0);

    expect(firstZeroingStage(trace)?.stage).toBe("city_filter");
  });

  it("returns null when nothing was ever dropped to zero", () => {
    const trace = createStageTrace();
    recordStage(trace, "india_directories", 0, 7);
    recordStage(trace, "city_filter", 7, 7);

    expect(firstZeroingStage(trace)).toBeNull();
  });

  it("returns null for an empty trace", () => {
    expect(firstZeroingStage(createStageTrace())).toBeNull();
    expect(firstZeroingStage(undefined)).toBeNull();
  });
});

describe("allProviderStepsEmpty", () => {
  const PROVIDERS = ["apollo", "india_directories", "google_places"];

  it("is true when every provider returned nothing — a sourcing failure", () => {
    const trace = createStageTrace();
    recordStage(trace, "apollo", 0, 0, "quota");
    recordStage(trace, "google_places", 0, 0, "quota exceeded");

    expect(allProviderStepsEmpty(trace, PROVIDERS)).toBe(true);
  });

  it("is false when any provider produced rows, even if a later filter zeroed them", () => {
    const trace = createStageTrace();
    recordStage(trace, "apollo", 0, 16);
    recordStage(trace, "city_filter", 16, 0);

    expect(allProviderStepsEmpty(trace, PROVIDERS)).toBe(false);
  });

  it("is false when no provider stage ran at all", () => {
    const trace = createStageTrace();
    recordStage(trace, "city_filter", 5, 5);

    expect(allProviderStepsEmpty(trace, PROVIDERS)).toBe(false);
  });
});

describe("compactTrace", () => {
  it("drops no-op stages but keeps any stage carrying a reason", () => {
    const trace = createStageTrace();
    recordStage(trace, "apollo", 0, 16);
    recordStage(trace, "google_places", 0, 0, "quota exceeded");
    recordStage(trace, "tavily_ai", 0, 0);

    expect(compactTrace(trace).map((r) => r.stage)).toEqual(["apollo", "google_places"]);
  });
});

describe("summarizeTrace", () => {
  it("renders the funnel as one scannable line", () => {
    const trace = createStageTrace();
    recordStage(trace, "apollo", 0, 16);
    recordStage(trace, "city_filter", 16, 0);

    expect(summarizeTrace(trace)).toBe("apollo: 0 -> 16 | city_filter: 16 -> 0");
  });

  it("returns empty string when there is nothing to show", () => {
    expect(summarizeTrace(createStageTrace())).toBe("");
  });
});
