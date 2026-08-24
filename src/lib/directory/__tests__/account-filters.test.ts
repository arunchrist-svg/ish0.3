import { describe, expect, it } from "vitest";
import {
  applyAccountCompanyView,
  applyAccountContactView,
  buildAccountCompanyPanelGroups,
  cityFilterId,
  companyMatchesAccountFilters,
  industryFilterId,
  businessFilterId,
} from "@/lib/directory/account-filters";
import type { DirectoryCompany, DirectoryContact } from "@/lib/api-client";
import { applyContactsListView } from "@/lib/contacts/contact-filters";
import type { ContactListItem } from "@/lib/api-client";

const company = (partial: Partial<DirectoryCompany> & { name: string }): DirectoryCompany => ({
  id: partial.id ?? partial.name,
  name: partial.name,
  city: partial.city ?? "Chennai",
  industry: partial.industry ?? "Technology",
  employees: partial.employees ?? "100",
  fitScore: partial.fitScore ?? 50,
  domain: partial.domain,
  website: partial.website,
  companyOverview: partial.companyOverview,
  createdAt: partial.createdAt ?? "2026-01-01T00:00:00.000Z",
  updatedAt: partial.updatedAt ?? partial.createdAt ?? "2026-01-01T00:00:00.000Z",
  contacts: partial.contacts ?? [],
});

const dirContact = (
  partial: Partial<DirectoryContact> & { name: string },
): DirectoryContact => ({
  leadId: partial.leadId ?? "l1",
  contactId: partial.contactId ?? "c1",
  name: partial.name,
  title: partial.title ?? "Manager",
  email: partial.email ?? "a@acme.com",
  emailStatus: partial.emailStatus ?? "verified",
  phone: partial.phone,
  linkedIn: partial.linkedIn,
  status: partial.status ?? "scouted",
  leadSource: partial.leadSource ?? "scout_wizard",
  score: partial.score ?? 60,
  savedAt: partial.savedAt ?? "2026-01-02T00:00:00.000Z",
  isKeyDM: partial.isKeyDM,
  companyId: partial.companyId ?? "a1",
  companyName: partial.companyName ?? "Acme",
  companyCity: partial.companyCity ?? "Chennai",
  companyIndustry: partial.companyIndustry ?? "Technology",
});

const contact = (partial: Partial<ContactListItem> & { name: string }): ContactListItem => ({
  id: partial.id ?? partial.name,
  leadId: partial.leadId ?? null,
  name: partial.name,
  title: partial.title ?? "",
  email: partial.email ?? "",
  emailStatus: partial.emailStatus ?? "missing",
  phone: partial.phone ?? null,
  linkedIn: partial.linkedIn ?? null,
  company: partial.company ?? "Acme",
  companyId: partial.companyId ?? "a1",
  city: partial.city ?? "Chennai",
  industry: partial.industry ?? "Technology",
  isKeyDM: partial.isKeyDM ?? false,
  hasLead: partial.hasLead ?? false,
  score: partial.score ?? null,
  status: partial.status ?? null,
});

describe("account company filters", () => {
  it("ORs scale filters and ANDs with website", () => {
    const rows = [
      company({ name: "A", employees: "5", domain: "a.com" }),
      company({ name: "B", employees: "100", domain: "b.com" }),
      company({ name: "C", employees: "5" }),
    ];
    const filtered = applyAccountCompanyView(rows, {
      query: "",
      quick: null,
      panel: new Set(["scale_micro", "scale_medium", "has_website"]),
      sort: "name",
    });
    expect(filtered.map((c) => c.name)).toEqual(["A", "B"]);
  });

  it("matches high fit quick filter", () => {
    expect(
      companyMatchesAccountFilters(company({ name: "X", fitScore: 80 }), "high_fit", new Set()),
    ).toBe(true);
    expect(
      companyMatchesAccountFilters(company({ name: "Y", fitScore: 40 }), "high_fit", new Set()),
    ).toBe(false);
  });

  it("filters by location industry and business", () => {
    const rows = [
      company({ name: "Tech", city: "Chennai", industry: "Technology" }),
      company({ name: "Bank", city: "Bengaluru", industry: "Banks" }),
      company({ name: "Auto", city: "Hosur", industry: "Automotive" }),
    ];
    expect(
      applyAccountCompanyView(rows, {
        query: "",
        quick: null,
        panel: new Set([cityFilterId("Chennai"), cityFilterId("Hosur")]),
        sort: "name",
      }).map((c) => c.name),
    ).toEqual(["Auto", "Tech"]);

    expect(
      applyAccountCompanyView(rows, {
        query: "",
        quick: null,
        panel: new Set([industryFilterId("Technology"), industryFilterId("Automotive")]),
        sort: "name",
      }).map((c) => c.name),
    ).toEqual(["Auto", "Tech"]);

    expect(
      applyAccountCompanyView(rows, {
        query: "",
        quick: null,
        panel: new Set([businessFilterId("Banks")]),
        sort: "name",
      }).map((c) => c.name),
    ).toEqual(["Bank"]);
  });

  it("sorts companies by date newest and oldest", () => {
    const rows = [
      company({ name: "Old", updatedAt: "2026-01-01T00:00:00.000Z" }),
      company({ name: "New", updatedAt: "2026-03-01T00:00:00.000Z" }),
      company({ name: "Mid", updatedAt: "2026-02-01T00:00:00.000Z" }),
    ];
    expect(
      applyAccountCompanyView(rows, {
        query: "",
        quick: null,
        panel: new Set(),
        sort: "date_newest",
      }).map((c) => c.name),
    ).toEqual(["New", "Mid", "Old"]);
    expect(
      applyAccountCompanyView(rows, {
        query: "",
        quick: null,
        panel: new Set(),
        sort: "date_oldest",
      }).map((c) => c.name),
    ).toEqual(["Old", "Mid", "New"]);
  });

  it("builds location industry business groups", () => {
    const groups = buildAccountCompanyPanelGroups(["Chennai", "Hosur"]);
    expect(groups.map((g) => g.id)).toEqual([
      "location",
      "industry",
      "business",
      "scale",
      "company",
    ]);
    expect(groups[0]?.filters.map((f) => f.id)).toEqual([
      cityFilterId("Chennai"),
      cityFilterId("Hosur"),
    ]);
  });
});

describe("account contact filters", () => {
  it("filters key DMs and sorts by score", () => {
    const rows = [
      dirContact({ name: "Low", score: 40, isKeyDM: true, savedAt: "2026-01-01T00:00:00.000Z" }),
      dirContact({ name: "High", score: 90, isKeyDM: true, savedAt: "2026-01-03T00:00:00.000Z" }),
      dirContact({ name: "Skip", score: 95, isKeyDM: false }),
    ];
    const filtered = applyAccountContactView(rows, {
      query: "",
      quick: "key_dm",
      panel: new Set(),
      sort: "score",
    });
    expect(filtered.map((c) => c.name)).toEqual(["High", "Low"]);
  });

  it("filters lead contacts by company city and industry", () => {
    const rows = [
      dirContact({ name: "A", companyCity: "Chennai", companyIndustry: "Technology" }),
      dirContact({ name: "B", companyCity: "Hosur", companyIndustry: "Banks" }),
    ];
    expect(
      applyAccountContactView(rows, {
        query: "",
        quick: null,
        panel: new Set([cityFilterId("Hosur"), businessFilterId("Banks")]),
        sort: "name",
      }).map((c) => c.name),
    ).toEqual(["B"]);
  });
});

describe("contacts page filters", () => {
  it("supports has lead quick and email OR group", () => {
    const rows = [
      contact({ name: "Biz", email: "a@acme.com", emailStatus: "verified", hasLead: true }),
      contact({ name: "Gmail", email: "a@gmail.com", emailStatus: "unverified", hasLead: true }),
      contact({ name: "None", email: "", emailStatus: "missing", hasLead: false }),
    ];
    const filtered = applyContactsListView(rows, {
      query: "",
      quick: "has_lead",
      panel: new Set(["business_email", "personal_email"]),
      sort: "name",
    });
    expect(filtered.map((c) => c.name).sort()).toEqual(["Biz", "Gmail"]);
  });
});
