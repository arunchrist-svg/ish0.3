import { describe, expect, it } from "vitest";
import {
  buildComingSoonQueriesForSource,
  buildOccasionQueriesForSource,
  COMING_SOON_SOURCES,
  competitorBrandAbsent,
  passesComingSoonPreFilter,
  passesOccasionPreFilter,
} from "../occasion-sources";
import { GIFT_INTEL_SOURCES } from "../sources";

describe("occasion sweep queries", () => {
  const news = GIFT_INTEL_SOURCES.find((s) => s.id === "india_business_news")!;
  const linkedin = GIFT_INTEL_SOURCES.find((s) => s.id === "linkedin_posts")!;

  it("omits competitor brand and includes city", () => {
    const queries = buildOccasionQueriesForSource(news, "openings", "Bengaluru");
    expect(queries[0]).toContain("Bengaluru");
    expect(queries[0]).toContain("new store");
    expect(queries.join(" ").toLowerCase()).not.toContain('"kanti sweets"');
    expect(queries.join(" ").toLowerCase()).not.toContain('"haldiram');
  });

  it("builds milestone queries without a brand", () => {
    const queries = buildOccasionQueriesForSource(linkedin, "milestones", "Pune");
    expect(queries[0]).toContain("foundation day");
    expect(queries[0]).toContain('"Pune"');
  });

  it("accepts a chain store opening without mithai", () => {
    expect(
      passesOccasionPreFilter({
        url: "https://economictimes.indiatimes.com/industry/retail/reliance-opens-store",
        title: "Reliance Retail opens new store in Whitefield",
        text: "Reliance Retail inaugurated a new Trend store in Bengaluru this week.",
      }),
    ).toBe(true);
  });

  it("rejects personal cafe openings and job ads", () => {
    expect(
      passesOccasionPreFilter({
        url: "https://www.linkedin.com/posts/jane-opened-cafe",
        text: "I opened my cafe this weekend and baked brownies.",
      }),
    ).toBe(false);
    expect(
      passesOccasionPreFilter({
        url: "https://www.linkedin.com/posts/acme-hiring",
        text: "We are hiring for our new store opening in Koramangala. Apply now.",
      }),
    ).toBe(false);
  });
});

describe("coming soon sweep queries", () => {
  const jobs = COMING_SOON_SOURCES.find((s) => s.id === "linkedin_jobs")!;
  const news = COMING_SOON_SOURCES.find((s) => s.id === "india_business_news")!;
  const careers = COMING_SOON_SOURCES.find((s) => s.id === "careers_web")!;

  it("scopes hiring and mall queries to city without competitor brands", () => {
    const hiring = buildComingSoonQueriesForSource(jobs, "Bengaluru");
    const mall = buildComingSoonQueriesForSource(news, "Pune");
    const web = buildComingSoonQueriesForSource(careers, "Hyderabad");
    expect(hiring[0]).toContain("Bengaluru");
    expect(hiring[0]).toMatch(/site:linkedin.com\/jobs/);
    expect(hiring[0]).toMatch(/store manager|opening soon/);
    expect(mall.join(" ")).toMatch(/Phoenix|tenant mix|coming soon/);
    expect(mall.join(" ")).toContain("Pune");
    expect(web.join(" ")).toContain("Hyderabad");
    expect(web.join(" ")).not.toMatch(/site:/);
    for (const query of [...hiring, ...mall, ...web]) {
      expect(competitorBrandAbsent(query, "Kanti Sweets")).toBe(true);
      expect(query.toLowerCase()).not.toContain("haldiram");
    }
  });

  it("accepts hiring for a new store and coming soon locator copy", () => {
    expect(
      passesComingSoonPreFilter({
        url: "https://www.linkedin.com/jobs/view/store-manager-whitefield",
        title: "Store Manager, new Trend store opening soon",
        text: "Hiring store manager for a new store opening soon in Whitefield, Bengaluru.",
      }),
    ).toBe(true);
    expect(
      passesComingSoonPreFilter({
        url: "https://economictimes.indiatimes.com/industry/retail/phoenix-tenant",
        text: "Phoenix Mall Whitefield tenant mix includes a new store coming soon after shopfit.",
      }),
    ).toBe(true);
  });

  it("rejects existing-store jobs, warehouse hiring, just-opened, and generic expansion", () => {
    expect(
      passesComingSoonPreFilter({
        url: "https://www.linkedin.com/jobs/view/staff-koramangala",
        text: "We are hiring store staff for our Koramangala store. Apply now.",
      }),
    ).toBe(false);
    expect(
      passesComingSoonPreFilter({
        url: "https://www.linkedin.com/jobs/view/warehouse-blr",
        text: "Hiring warehouse associates for our new store DC in Bengaluru. Opening soon.",
      }),
    ).toBe(false);
    expect(
      passesComingSoonPreFilter({
        url: "https://www.linkedin.com/posts/opened-yesterday",
        text: "We just opened yesterday. Grand opening held at our new store in Whitefield.",
      }),
    ).toBe(false);
    expect(
      passesComingSoonPreFilter({
        url: "https://www.linkedin.com/posts/expanding",
        text: "We are expanding our team this quarter across functions.",
      }),
    ).toBe(false);
  });
});
