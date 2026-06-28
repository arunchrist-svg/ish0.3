export type ReplyNextAction = {
  action: "send_reply" | "book_tasting" | "mark_not_interested" | "wait";
  title: string;
  description: string;
  cta: string;
};

export function suggestReplyNextAction(params: {
  hasReplyDraft: boolean;
  hasOutboundReply: boolean;
  inboundSnippet?: string | null;
}): ReplyNextAction {
  const { hasReplyDraft, hasOutboundReply, inboundSnippet } = params;

  if (hasOutboundReply) {
    return {
      action: "book_tasting",
      title: "Reply sent. Move the deal forward.",
      description: "They are in thread. Mark tasting sent or continue the conversation from Lead Accelerator.",
      cta: "Open lead",
    };
  }

  if (hasReplyDraft) {
    return {
      action: "send_reply",
      title: "AI drafted a reply for you",
      description: inboundSnippet
        ? "Review the suggested response and send it in their thread."
        : "Your reply draft is ready. Review and send to keep momentum.",
      cta: "Review & send reply",
    };
  }

  const lower = (inboundSnippet ?? "").toLowerCase();
  if (/\b(not interested|unsubscribe|remove|stop emailing)\b/.test(lower)) {
    return {
      action: "mark_not_interested",
      title: "They may not be interested",
      description: "Consider closing this lead or sending a brief, respectful final note.",
      cta: "Draft a reply",
    };
  }

  return {
    action: "send_reply",
    title: "They replied. Sequence paused.",
    description: "Follow-ups are on hold. Draft a reply to continue the conversation.",
    cta: "Draft reply with AI",
  };
}
