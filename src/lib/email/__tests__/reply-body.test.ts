import { describe, expect, it } from "vitest";
import { extractLatestReplyText } from "@/lib/email/reply-body";

describe("extractLatestReplyText", () => {
  it("keeps short reply before Gmail quote block", () => {
    const raw = `Sure

On Mon, 29 Jun, 2026, 6:00 pm Srilaksha, <srilaksha.ish@gmail.com> wrote:
> Would you be open to receiving a complimentary Diwali tasting sample?`;
    expect(extractLatestReplyText(raw)).toBe("Sure");
  });

  it("strips lines prefixed with >", () => {
    expect(extractLatestReplyText("Yes please\n> old quote")).toBe("Yes please");
  });
});
