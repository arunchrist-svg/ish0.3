import { describe, expect, it } from "vitest";
import { resolveNetworkMembers } from "../members";

const connections = [
  {
    id: "lc1",
    firstName: "Himanshu",
    lastName: "Chauhan",
    linkedInUrl: "https://www.linkedin.com/in/himanshu-chauhan",
    company: "Zopper",
  },
];

describe("resolveNetworkMembers", () => {
  it("uses Settings users and drops unmatched LinkedIn imports", () => {
    const members = resolveNetworkMembers(
      [{ id: "u1", name: "Arun Murugesan", email: "arun@ish.com", linkedIn: "https://www.linkedin.com/in/arun" }],
      [
        {
          id: "tm-orphan",
          userId: null,
          name: "ISH Cluster Mgr",
          email: "cm@indiasweethouse.com",
          connections,
        },
      ],
    );

    expect(members).toHaveLength(1);
    expect(members[0]?.name).toBe("Arun Murugesan");
    expect(members[0]?.linkedIn).toBe("https://www.linkedin.com/in/arun");
    expect(members[0]?.connections).toEqual([]);
  });

  it("attaches imported connections to the Settings user by email", () => {
    const members = resolveNetworkMembers(
      [{ id: "u1", name: "Arun Murugesan", email: "cm@indiasweethouse.com", linkedIn: null }],
      [
        {
          id: "tm1",
          userId: null,
          name: "ISH Cluster Mgr",
          email: "cm@indiasweethouse.com",
          linkedInUrl: "https://www.linkedin.com/in/ish-cm",
          connections,
        },
      ],
    );

    expect(members[0]?.name).toBe("Arun Murugesan");
    expect(members[0]?.linkedIn).toBe("https://www.linkedin.com/in/ish-cm");
    expect(members[0]?.connections).toHaveLength(1);
  });

  it("prefers userId match over email", () => {
    const members = resolveNetworkMembers(
      [{ id: "u1", name: "Meera", email: "meera@ish.com", linkedIn: null }],
      [
        {
          id: "tm1",
          userId: "u1",
          name: "LinkedIn Name",
          email: "other@ish.com",
          connections,
        },
      ],
    );

    expect(members[0]?.connections).toHaveLength(1);
    expect(members[0]?.name).toBe("Meera");
  });
});
