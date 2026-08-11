import type { ConnectionDegree } from "./degree";

export type { ConnectionDegree };

export type NetworkNodeType = "target" | "colleague" | "connector" | "bridge";

export type NetworkNode = {
  id: string;
  type: NetworkNodeType;
  name: string;
  email?: string;
  linkedIn?: string;
  title?: string;
  degree?: ConnectionDegree;
};

export type NetworkEdgeKind = "linkedin_direct" | "crm_colleague" | "intro_path";

export type NetworkEdge = {
  from: string;
  to: string;
  kind: NetworkEdgeKind;
  strength: 1 | 2 | 3 | 4;
};

export type NetworkPerson = {
  id: string;
  name: string;
  headline: string;
  title?: string;
  email?: string;
  linkedIn?: string;
  degree: ConnectionDegree;
  relationship: string;
  connectorName?: string;
  connectorId?: string;
  connectorEmail?: string;
  mutualNames: string[];
  path: string[];
  cta: "connect" | "message";
};

export type WarmIntro = {
  connectorName: string;
  connectorEmail?: string;
  connectorId?: string;
  path: string[];
  strength: 1 | 2 | 3 | 4;
  relationship: string;
  name: string;
  email?: string;
  linkedIn?: string;
  degree?: ConnectionDegree;
  headline?: string;
};

export type NetworkGraph = {
  companyName: string;
  target: NetworkPerson;
  people: NetworkPerson[];
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  warmIntros: WarmIntro[];
  summary: {
    firstDegree: number;
    secondDegree: number;
    thirdDegree: number;
    directPaths: number;
    colleaguePaths: number;
    lastComputedAt: string;
    hasLinkedInImport: boolean;
  };
};

export type NetworkSummaryItem = {
  name: string;
  email?: string;
  linkedIn?: string;
  strength: 1 | 2 | 3 | 4;
  degree: ConnectionDegree;
  headline?: string;
  relationship: string;
  connectorName: string;
  path: string[];
};
