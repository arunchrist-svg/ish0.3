import { describe, expect, it, vi, afterEach } from "vitest";
import { clearWebsiteProbeCache, probeCompanyWebsiteLive } from "@/lib/enrichment/website-probe";

describe("probeCompanyWebsiteLive", () => {
  afterEach(() => {
    clearWebsiteProbeCache();
    vi.unstubAllGlobals();
  });

  it("marks HTTP 410 Gone as dead", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("gone", { status: 410 })),
    );
    await expect(probeCompanyWebsiteLive("cinemax.co.in")).resolves.toBe("dead");
  });

  it("marks HTTP 403 and 404 as dead for scout websites", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("forbidden", { status: 403 })),
    );
    await expect(probeCompanyWebsiteLive("skypeoplefruitjuice.com")).resolves.toBe("dead");

    clearWebsiteProbeCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("missing", { status: 404 })),
    );
    await expect(probeCompanyWebsiteLive("broken.example")).resolves.toBe("dead");
  });

  it("treats directory and wixsite hosts as dead without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(probeCompanyWebsiteLive("mandya.idbf.in")).resolves.toBe("dead");
    await expect(probeCompanyWebsiteLive("sarathitrisha.wixsite.com")).resolves.toBe("dead");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks 2xx hosts as live", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200 })),
    );
    await expect(probeCompanyWebsiteLive("calderys.com")).resolves.toBe("live");
  });

  it("treats timeouts as unknown rather than dead", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      }),
    );
    await expect(probeCompanyWebsiteLive("slow.example")).resolves.toBe("unknown");
  });
});
