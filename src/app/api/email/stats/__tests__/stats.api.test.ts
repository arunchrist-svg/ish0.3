import { describe, expect, it, beforeAll, afterEach } from "vitest";
import { GET as getEmailStats } from "../route";
import { GET as getEmailOverview } from "../../overview/route";
import { GET as getHubBadge } from "@/app/api/hub/badge/route";
import {
  authenticateTestUser,
  clearTestSession,
  hasTestDatabase,
} from "@/test/api-helpers";

describe.skipIf(!hasTestDatabase())("email attention badge counts", () => {
  beforeAll(async () => {
    await authenticateTestUser();
  });

  afterEach(() => {
    clearTestSession();
  });

  it("AUTH returns 401 without session", async () => {
    clearTestSession();
    const res = await getEmailStats();
    expect(res.status).toBe(401);
  });

  it("aligns /api/email/stats with overview counts and hub badge", async () => {
    await authenticateTestUser();

    const [statsRes, overviewRes, hubRes] = await Promise.all([
      getEmailStats(),
      getEmailOverview(new Request("http://localhost/api/email/overview?counts=1")),
      getHubBadge(),
    ]);

    expect(statsRes.status).toBe(200);
    expect(overviewRes.status).toBe(200);
    expect(hubRes.status).toBe(200);

    const stats = await statsRes.json();
    const overview = await overviewRes.json();
    const hub = await hubRes.json();

    expect(stats.needsReview).toBe(overview.stats.needsReview);
    expect(stats.replies).toBe(overview.stats.replies);
    expect(hub.needsReview).toBe(stats.needsReview);
    expect(hub.replies).toBe(stats.replies);
    expect(hub.inboxCount).toBe(stats.needsReview + stats.replies);
    expect(typeof stats.needsReview).toBe("number");
    expect(typeof stats.replies).toBe("number");
    expect(stats.needsReview).toBeGreaterThanOrEqual(0);
    expect(stats.replies).toBeGreaterThanOrEqual(0);
  });
});
