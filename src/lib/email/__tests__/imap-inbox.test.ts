import { describe, expect, it, vi } from "vitest";
import {
  chunkUids,
  formatImapPollError,
  searchRecentInboxUids,
  trimRecentUids,
} from "@/lib/email/imap-inbox";

describe("formatImapPollError", () => {
  it("turns generic Command failed into actionable guidance", () => {
    expect(formatImapPollError(new Error("Command failed"), "imap.zoho.in")).toMatch(
      /Enable IMAP.*app-specific password/i,
    );
  });

  it("includes server response text when available", () => {
    const err = Object.assign(new Error("Command failed"), {
      responseText: "IMAP access disabled for this account",
    });
    expect(formatImapPollError(err, "imap.gmail.com")).toContain("IMAP access disabled");
  });
});

describe("trimRecentUids", () => {
  it("keeps only the newest uid window", () => {
    expect(trimRecentUids([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5]);
  });
});

describe("chunkUids", () => {
  it("splits uid lists into fetch batches", () => {
    expect(chunkUids([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe("searchRecentInboxUids", () => {
  it("falls back to ALL when SINCE search fails", async () => {
    const client = {
      search: vi
        .fn()
        .mockRejectedValueOnce(new Error("Command failed"))
        .mockResolvedValueOnce([10, 11, 12]),
    };

    const uids = await searchRecentInboxUids(client as never, new Date("2026-08-01T00:00:00.000Z"));
    expect(uids).toEqual([10, 11, 12]);
    expect(client.search).toHaveBeenCalledTimes(2);
  });
});
