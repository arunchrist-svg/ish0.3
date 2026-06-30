export const AGENTS = {
  replyRouter: "reply-router",
  replyPlanner: "reply-planner",
  replyWriter: "reply-writer",
  notifyReply: "notify-reply",
  searchAgent: "search-agent",
  relatedLeads: "related-leads",
} as const;

export type AgentName = (typeof AGENTS)[keyof typeof AGENTS];
