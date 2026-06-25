import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  scoreContactCandidate,
  isNamedPerson,
  shouldAutoAcceptEmail,
  confidenceTier,
  confidenceLabel,
  getEmailConfidenceAutoAccept,
} from "@/lib/enrichment/confidence";

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("ENRICH-UNIT-003 confidence scoring", () => {
  it("scores named person with verified email higher", () => {
    const score = scoreContactCandidate(
      { name: "Priya Sharma", company: "Test Corp" },
      { email: "priya.sharma@testcorp.in", phone: "9845012345" },
      "hunter",
    );
    expect(score).toBeGreaterThan(50);
  });

  it("penalizes generic emails for named persons", () => {
    const named = scoreContactCandidate(
      { name: "Priya Sharma", company: "Test Corp" },
      { email: "info@testcorp.in" },
      "hunter",
    );
    const generic = scoreContactCandidate(
      { name: "Test Corp", company: "Test Corp" },
      { email: "info@testcorp.in" },
      "hunter",
    );
    expect(named).toBeLessThan(generic + 20);
  });

  it("penalizes low-trust providers", () => {
    const hunter = scoreContactCandidate(
      { name: "John Doe", company: "Acme" },
      { email: "john@acme.com" },
      "hunter",
    );
    const web = scoreContactCandidate(
      { name: "John Doe", company: "Acme" },
      { email: "john@acme.com" },
      "web_snippets",
    );
    expect(hunter).toBeGreaterThan(web);
  });

  it("identifies named persons", () => {
    expect(isNamedPerson("Priya Sharma")).toBe(true);
    expect(isNamedPerson("Priya")).toBe(false);
    expect(isNamedPerson("")).toBe(false);
  });

  it("auto-accepts high-confidence personal emails", () => {
    expect(shouldAutoAcceptEmail(60, "priya@testcorp.in")).toBe(true);
    expect(shouldAutoAcceptEmail(30, "priya@testcorp.in")).toBe(false);
  });

  it("rejects generic email for named person even with decent score", () => {
    expect(shouldAutoAcceptEmail(50, "info@testcorp.in", { namedPerson: true })).toBe(false);
  });

  it("returns confidence tiers and labels", () => {
    expect(confidenceTier(60, "priya@testcorp.in")).toBe("good");
    expect(confidenceTier(45, "info@testcorp.in")).toBe("generic");
    expect(confidenceTier(20, "priya@testcorp.in")).toBe("low");
    expect(confidenceTier(60, null)).toBe("missing");
    expect(confidenceLabel("good")).toBe("Good");
    expect(confidenceLabel("missing")).toBe("Missing");
  });

  it("reads auto-accept threshold from env", () => {
    process.env.EMAIL_CONFIDENCE_AUTO_ACCEPT = "70";
    expect(getEmailConfidenceAutoAccept()).toBe(70);
  });
});
