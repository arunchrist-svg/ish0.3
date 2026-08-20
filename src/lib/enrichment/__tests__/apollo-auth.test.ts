import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApolloAuthError,
  apolloSearchCompanies,
  apolloSearchPeople,
  apolloSearchPersonByName,
  isApolloAuthError,
} from "@/lib/enrichment/apollo";

describe("isApolloAuthError", () => {
  it("detects typed auth failures and 401 messages", () => {
    expect(isApolloAuthError(new ApolloAuthError(401))).toBe(true);
    expect(
      isApolloAuthError(
        new Error("Apollo /mixed_people/search failed: 401 Invalid API key. See https://docs.apollo.io/reference/authentication"),
      ),
    ).toBe(true);
    expect(isApolloAuthError(new Error("Apollo hit an API rate limit"))).toBe(false);
  });
});

describe("apolloSearchCompanies request", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses organization search with keyword tags and metro expansion for neighborhoods", async () => {
    vi.stubEnv("APOLLO_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        organizations: [
          {
            id: "org1",
            name: "Infosys",
            primary_domain: "infosys.com",
            city: "Bengaluru",
            industry: "Technology",
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const companies = await apolloSearchCompanies({
      cities: ["Kasturi Nagar"],
      industries: ["Technology"],
      limit: 10,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toContain("/organizations/search");
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.q_organization_keyword_tags).toEqual(["Technology"]);
    expect(body.organization_locations).toEqual(
      expect.arrayContaining(["Kasturi Nagar", "Bengaluru", "Bangalore"]),
    );
    expect(body.q_organization_city_locations).toBeUndefined();
    expect(body.organization_industry_tag_ids).toBeUndefined();
    expect(companies.map((c) => c.name)).toEqual(["Infosys"]);
  });
});

describe("apolloSearchPeople request", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends domain aliases on q_organization_domains_list without a city lock", async () => {
    vi.stubEnv("APOLLO_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        people: [{ id: "p1", name: "Asha Rao", title: "HR Director", city: "Bengaluru" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await apolloSearchPeople({
      companyDomain: "titancompany.in",
      companyDomains: ["titancompany.in", "titan.co.in"],
      titles: ["Director", "Manager"],
      limit: 5,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body.q_organization_domains_list).toEqual(["titancompany.in", "titan.co.in"]);
    expect(body.q_organization_domains).toEqual(["titancompany.in", "titan.co.in"]);
    expect(body.person_locations).toBeUndefined();
    expect(body.include_similar_titles).toBe(true);
  });

  it("retries without title filters when the titled search is empty", async () => {
    vi.stubEnv("APOLLO_API_KEY", "test-key");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ people: [] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ people: [{ id: "p2", name: "Rahul Nair", title: "Plant Head" }] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const people = await apolloSearchPeople({
      companyDomain: "titancompany.in",
      companyDomains: ["titancompany.in"],
      titles: ["CHRO", "Procurement"],
      limit: 5,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, retryInit] = fetchMock.mock.calls[1] as [string, { body: string }];
    const retryBody = JSON.parse(retryInit.body) as Record<string, unknown>;
    expect(retryBody.person_titles).toBeUndefined();
    expect(people.map((p) => p.name)).toEqual(["Rahul Nair"]);
  });
});

describe("apolloSearchPersonByName", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("drops Open to Work headlines", async () => {
    vi.stubEnv("APOLLO_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          people: [
            { id: "p1", name: "Asha Rao", title: "HR Director", headline: "HR Director at Titan" },
            {
              id: "p2",
              name: "Kiran M",
              title: "HR Manager",
              headline: "#OPENTOWORK | HR Manager",
            },
          ],
        }),
      }),
    );

    const people = await apolloSearchPersonByName({ name: "HR", domain: "titancompany.in" });
    expect(people.map((p) => p.name)).toEqual(["Asha Rao"]);
  });
});
