export type ResearchLeadRequested = {
  name: "research/lead.requested";
  data: { leadId: string };
};

export type ReplyLeadReceived = {
  name: "reply/lead.received";
  data: { leadId: string; tenantId: string; workspaceId: string };
};

export type AppEvents = ResearchLeadRequested | ReplyLeadReceived;
