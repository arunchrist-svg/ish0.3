import { describe, expect, it, vi, beforeEach } from "vitest";
import * as dns from "dns";
import {
  cleanEmailAddress,
  _resetListCleanerCachesForTests,
} from "@/lib/email/list-cleaner";

describe("cleanEmailAddress", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetListCleanerCachesForTests();
    delete process.env.EMAIL_RCPT_PROBE;
  });

  it("rejects invalid format", async () => {
    const r = await cleanEmailAddress("not-an-email");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("invalid_format");
  });

  it("rejects domains with no MX", async () => {
    vi.spyOn(dns.promises, "resolveMx").mockRejectedValue(
      Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }),
    );
    const r = await cleanEmailAddress("user@nomx-test.co");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_mx");
  });

  it("passes format+MX when probe disabled", async () => {
    vi.spyOn(dns.promises, "resolveMx").mockResolvedValue([
      { exchange: "mx.acme-corp.test", priority: 10 },
    ]);
    const r = await cleanEmailAddress("person@acme-corp.test");
    expect(r.ok).toBe(true);
    expect(r.reason).toBe("probe_disabled");
  });
});
