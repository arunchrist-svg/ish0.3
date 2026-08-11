import { describe, expect, it } from "vitest";
import {
  connectionDegree,
  degreeCta,
  degreeRelationshipLabel,
  degreeToStrength,
  formatHeadline,
  strengthToDegree,
} from "../degree";

describe("connectionDegree", () => {
  it("is 1st when a teammate is directly connected", () => {
    expect(connectionDegree({ isDirectConnection: true, hasFirstDegreeAtCompany: false })).toBe("1st");
  });

  it("is 2nd when the team knows someone else at the company", () => {
    expect(connectionDegree({ isDirectConnection: false, hasFirstDegreeAtCompany: true })).toBe("2nd");
  });

  it("is 3rd with no LinkedIn path", () => {
    expect(connectionDegree({ isDirectConnection: false, hasFirstDegreeAtCompany: false })).toBe("3rd");
  });
});

describe("degreeCta", () => {
  it("matches LinkedIn: Connect for 2nd, Message for 1st and 3rd", () => {
    expect(degreeCta("1st")).toBe("message");
    expect(degreeCta("2nd")).toBe("connect");
    expect(degreeCta("3rd")).toBe("message");
  });
});

describe("formatHeadline", () => {
  it("joins title and company like LinkedIn", () => {
    expect(formatHeadline("VP Sales", "Zopper")).toBe("VP Sales · Zopper");
  });

  it("falls back to whichever side exists", () => {
    expect(formatHeadline("VP Sales", null)).toBe("VP Sales");
    expect(formatHeadline("  ", "Zopper")).toBe("Zopper");
    expect(formatHeadline(null, null)).toBe("");
  });
});

describe("degree mapping", () => {
  it("round-trips strength for summary cards", () => {
    expect(strengthToDegree(degreeToStrength("1st"))).toBe("1st");
    expect(strengthToDegree(degreeToStrength("2nd"))).toBe("2nd");
    expect(strengthToDegree(degreeToStrength("3rd"))).toBe("3rd");
  });
});

describe("degreeRelationshipLabel", () => {
  it("names the teammate for 1st degree", () => {
    expect(degreeRelationshipLabel("1st", { connectorName: "Arun" })).toBe("Connected to Arun");
  });

  it("names the mutual for 2nd degree", () => {
    expect(degreeRelationshipLabel("2nd", { mutualNames: ["Himanshu Chauhan"] })).toBe(
      "2nd degree via Himanshu Chauhan",
    );
  });
});
