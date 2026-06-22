export type NetworkNodeType = "target" | "colleague" | "connector" | "bridge";

export type NetworkNode = {
  id: string;
  type: NetworkNodeType;
  name: string;
  email?: string;
  linkedIn?: string;
  title?: string;
};

export type NetworkEdgeKind = "linkedin_direct" | "crm_colleague" | "intro_path";

export type NetworkEdge = {
  from: string;
  to: string;
  kind: NetworkEdgeKind;
  strength: 1 | 2 | 3 | 4;
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
};

export type NetworkGraph = {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  warmIntros: WarmIntro[];
  summary: {
    directPaths: number;
    colleaguePaths: number;
    lastComputedAt: string;
  };
};

export type NetworkSummaryItem = {
  name: string;
  email?: string;
  linkedIn?: string;
  strength: 1 | 2 | 3 | 4;
  relationship: string;
  connectorName: string;
  path: string[];
};
