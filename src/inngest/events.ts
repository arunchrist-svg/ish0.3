export type ResearchLeadRequested = {
  name: "research/lead.requested";
  data: { leadId: string };
};

export type ReplyLeadReceived = {
  name: "reply/lead.received";
  data: { leadId: string; tenantId: string; workspaceId: string };
};

export type WriterLeadRequested = {
  name: "writer/lead.requested";
  data: {
    leadId: string;
    tenantId: string;
    mode?: "single" | "sequence";
    outreachTemplate?: string;
    writerMode?: string;
    occasionTheme?: string | null;
  };
};

export type EnrichLeadRequested = {
  name: "enrich/lead.requested";
  data: {
    leadId: string;
    tenantId: string;
    mode: "free" | "paid";
    dataMode?: string;
    refetch?: boolean;
  };
};

export type AppEvents =
  | ResearchLeadRequested
  | ReplyLeadReceived
  | WriterLeadRequested
  | EnrichLeadRequested;
