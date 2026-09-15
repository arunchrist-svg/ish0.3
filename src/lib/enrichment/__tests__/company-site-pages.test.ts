import { describe, expect, it } from "vitest";
import { companySiteBaseUrl, htmlToVisibleText } from "@/lib/enrichment/company-site-pages";

describe("companySiteBaseUrl", () => {
  it("normalizes a public website", () => {
    expect(companySiteBaseUrl("www.acme.com")).toBe("https://www.acme.com");
  });

  it("rejects private hosts", () => {
    expect(companySiteBaseUrl("http://127.0.0.1")).toBeNull();
    expect(companySiteBaseUrl(undefined, "localhost")).toBeNull();
  });
});

describe("htmlToVisibleText", () => {
  it("strips scripts and tags", () => {
    const text = htmlToVisibleText(
      "<html><head><script>steal()</script><title>Acme</title></head><body><h1>Leadership</h1><p>Priya Sharma, Head of HR</p></body></html>",
    );
    expect(text).toContain("Priya Sharma");
    expect(text).not.toContain("steal");
    expect(text).not.toContain("<h1>");
  });
});
