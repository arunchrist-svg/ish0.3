import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getResend = vi.fn();

vi.mock("@/lib/email/resend-transport", () => ({
  getResend: (...args: unknown[]) => getResend(...args),
}));

import { getReceivedEmail, listReceivedEmails } from "@/lib/email/resend-receiving";

describe("resend receiving helpers", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    getResend.mockReset();
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("lists received emails through the SDK", async () => {
    const list = vi.fn().mockResolvedValue({
      data: {
        object: "list",
        has_more: false,
        data: [
          {
            id: "email_1",
            from: "prasantmishra@indiasweethouse.in",
            to: ["hello@srilakshaenterprises.in"],
            created_at: "2026-08-17T12:00:00.000Z",
            subject: "Re: Sample box",
            message_id: "<abc@indiasweethouse.in>",
          },
        ],
      },
      error: null,
    });
    getResend.mockReturnValue({ emails: { receiving: { list, get: vi.fn() } } });

    const result = await listReceivedEmails("re_test", { limit: 100 });
    expect(list).toHaveBeenCalledWith({ limit: 100 });
    expect(result.hasMore).toBe(false);
    expect(result.data[0]?.from).toBe("prasantmishra@indiasweethouse.in");
  });

  it("retrieves a received email body through the SDK", async () => {
    const get = vi.fn().mockResolvedValue({
      data: {
        id: "email_1",
        from: "prasantmishra@indiasweethouse.in",
        text: "Please send the tasting box.",
        html: "<p>Please send the tasting box.</p>",
      },
      error: null,
    });
    getResend.mockReturnValue({ emails: { receiving: { list: vi.fn(), get } } });

    const detail = await getReceivedEmail("email_1", "re_test");
    expect(get).toHaveBeenCalledWith("email_1");
    expect(detail?.text).toBe("Please send the tasting box.");
  });

  it("falls back to REST when the SDK receiving API is missing", async () => {
    getResend.mockReturnValue({ emails: {} });
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/emails/receiving?limit=50")) {
        return {
          ok: true,
          json: async () => ({ object: "list", has_more: true, data: [{ id: "email_2", from: "a@b.com" }] }),
        };
      }
      if (String(url).includes("/emails/receiving/email_2")) {
        return {
          ok: true,
          json: async () => ({ id: "email_2", from: "a@b.com", text: "yes" }),
        };
      }
      throw new Error(`unexpected url ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const listed = await listReceivedEmails("re_test", { limit: 50 });
    expect(listed.hasMore).toBe(true);
    expect(listed.data[0]?.id).toBe("email_2");

    const detail = await getReceivedEmail("email_2", "re_test");
    expect(detail?.text).toBe("yes");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
