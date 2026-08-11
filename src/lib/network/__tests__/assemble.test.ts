import { describe, expect, it } from "vitest";
import { assembleCompanyNetwork } from "../assemble";

const target = {
  id: "t1",
  name: "Pallavi Gupta",
  email: "pallavi@zopper.com",
  linkedIn: "https://www.linkedin.com/in/pallavi-gupta",
  title: "Director",
};

const colleagues = [
  {
    id: "c1",
    name: "Himanshu Chauhan",
    email: "himanshu@zopper.com",
    linkedIn: "https://www.linkedin.com/in/himanshu-chauhan",
    title: "Engineering Manager",
  },
  {
    id: "c2",
    name: "Pawan Kumar",
    email: "pawan@zopper.com",
    title: "Product Lead",
  },
];

describe("assembleCompanyNetwork", () => {
  it("treats CRM-only colleagues as 3rd degree people at the company", () => {
    const graph = assembleCompanyNetwork({
      target,
      accountName: "Zopper",
      colleagues,
      members: [],
    });

    expect(graph.target.degree).toBe("3rd");
    expect(graph.target.cta).toBe("message");
    expect(graph.target.headline).toBe("Director · Zopper");
    expect(graph.people).toHaveLength(2);
    expect(graph.people.every((p) => p.degree === "3rd")).toBe(true);
    expect(graph.people.every((p) => p.cta === "message")).toBe(true);
    expect(graph.summary.firstDegree).toBe(0);
    expect(graph.summary.thirdDegree).toBe(2);
    expect(graph.summary.hasLinkedInImport).toBe(false);
  });

  it("marks the target 1st and colleagues 2nd when a teammate is connected to the lead", () => {
    const graph = assembleCompanyNetwork({
      target,
      accountName: "Zopper",
      colleagues,
      members: [
        {
          id: "m1",
          name: "Arun Murugesan",
          email: "arun@ish.com",
          connections: [
            {
              id: "lc1",
              firstName: "Pallavi",
              lastName: "Gupta",
              linkedInUrl: "https://www.linkedin.com/in/pallavi-gupta",
              company: "Zopper",
              position: "Director",
            },
          ],
        },
      ],
    });

    expect(graph.target.degree).toBe("1st");
    expect(graph.target.cta).toBe("message");
    expect(graph.target.connectorName).toBe("Arun Murugesan");
    expect(graph.people.find((p) => p.name === "Himanshu Chauhan")?.degree).toBe("2nd");
    expect(graph.people.find((p) => p.name === "Pawan Kumar")?.cta).toBe("connect");
    expect(graph.summary.directPaths).toBe(1);
    expect(graph.summary.hasLinkedInImport).toBe(true);
  });

  it("marks a matched colleague 1st and the target 2nd via that person", () => {
    const graph = assembleCompanyNetwork({
      target,
      accountName: "Zopper",
      colleagues,
      members: [
        {
          id: "m1",
          name: "ISH Cluster Mgr",
          connections: [
            {
              id: "lc1",
              firstName: "Himanshu",
              lastName: "Chauhan",
              linkedInUrl: "https://www.linkedin.com/in/himanshu-chauhan",
              company: "Zopper",
              position: "Engineering Manager",
            },
          ],
        },
      ],
    });

    expect(graph.target.degree).toBe("2nd");
    expect(graph.target.cta).toBe("connect");
    expect(graph.target.mutualNames).toContain("Himanshu Chauhan");
    expect(graph.people.find((p) => p.name === "Himanshu Chauhan")?.degree).toBe("1st");
    expect(graph.people.find((p) => p.name === "Pawan Kumar")?.degree).toBe("2nd");
    expect(graph.summary.colleaguePaths).toBe(1);
    expect(graph.summary.secondDegree).toBe(1);
  });

  it("treats an unmatched LinkedIn connection at the company as a 1st-degree profile", () => {
    const graph = assembleCompanyNetwork({
      target,
      accountName: "Zopper",
      colleagues,
      members: [
        {
          id: "m1",
          name: "Arun",
          connections: [
            {
              id: "lc1",
              firstName: "Shivani",
              lastName: "Agarwal",
              linkedInUrl: "https://www.linkedin.com/in/shivani-agarwal",
              company: "Zopper",
              position: "Senior Talent Acquisition Specialist",
            },
          ],
        },
      ],
    });

    const shivani = graph.people.find((p) => p.name === "Shivani Agarwal");
    expect(shivani?.degree).toBe("1st");
    expect(shivani?.headline).toBe("Senior Talent Acquisition Specialist · Zopper");
    expect(graph.target.degree).toBe("2nd");
    expect(graph.people.find((p) => p.name === "Himanshu Chauhan")?.degree).toBe("2nd");
  });

  it("merges the same LinkedIn person imported by two teammates", () => {
    const graph = assembleCompanyNetwork({
      target,
      accountName: "Zopper",
      colleagues: [],
      members: [
        {
          id: "m1",
          name: "Arun",
          connections: [
            {
              id: "lc1",
              firstName: "Amit",
              lastName: "Srivastava",
              linkedInUrl: "https://www.linkedin.com/in/amit-srivastava",
              company: "Zopper",
              position: "SVP",
            },
          ],
        },
        {
          id: "m2",
          name: "Meera",
          connections: [
            {
              id: "lc2",
              firstName: "Amit",
              lastName: "Srivastava",
              linkedInUrl: "https://www.linkedin.com/in/amit-srivastava",
              company: "Zopper",
              position: "SVP",
            },
          ],
        },
      ],
    });

    const amits = graph.people.filter((p) => p.name === "Amit Srivastava");
    expect(amits).toHaveLength(1);
    expect(amits[0]?.mutualNames).toEqual(["Arun", "Meera"]);
  });

  it("sorts more-people list 1st, then 2nd, then 3rd", () => {
    const graph = assembleCompanyNetwork({
      target,
      accountName: "Zopper",
      colleagues,
      members: [
        {
          id: "m1",
          name: "Arun",
          connections: [
            {
              id: "lc1",
              firstName: "Himanshu",
              lastName: "Chauhan",
              linkedInUrl: "https://www.linkedin.com/in/himanshu-chauhan",
              company: "Zopper",
            },
          ],
        },
      ],
    });

    expect(graph.people.map((p) => p.degree)).toEqual(["1st", "2nd"]);
    expect(graph.people[0]?.name).toBe("Himanshu Chauhan");
  });

  it("omits team members with no path at the company from connector nodes", () => {
    const graph = assembleCompanyNetwork({
      target,
      accountName: "Zopper",
      colleagues,
      members: [
        { id: "m1", name: "ISH Cluster Mgr", connections: [] },
        {
          id: "m2",
          name: "Arun Murugesan",
          linkedIn: "https://www.linkedin.com/in/arun",
          connections: [
            {
              id: "lc1",
              firstName: "Himanshu",
              lastName: "Chauhan",
              linkedInUrl: "https://www.linkedin.com/in/himanshu-chauhan",
              company: "Zopper",
            },
          ],
        },
      ],
    });

    const connectors = graph.nodes.filter((n) => n.type === "connector");
    expect(connectors.map((c) => c.name)).toEqual(["Arun Murugesan"]);
    expect(connectors[0]?.linkedIn).toBe("https://www.linkedin.com/in/arun");
  });
});
