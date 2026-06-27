import { callLLM } from "@/lib/llm";
import { db, leadOutreach, leads, contacts, accounts, leadResearch } from "@/db";
import { eq, desc } from "drizzle-orm";
import { scoreSpamMeter, deliverabilityVerdict } from "@/lib/agents/writer-scoring";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { normalizeReplySubject, stripReplyPrefix } from "@/lib/email/threading";

const PROMPT_VERSION = "v1.0-reply";

export async function runReplyWriter(leadId: string): Promise<string> {
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, leadId),
    with: { contact: true, account: true },
  });

  if (!lead) throw new Error(`Lead ${leadId} not found`);

  const emailConfig = await getResolvedEmailConfig(lead.workspaceId);
  const senderFirstName = emailConfig.fromName.split(" ")[0] || emailConfig.fromName;
  const contact = lead.contact as typeof contacts.$inferSelect;
  const account = lead.account as typeof accounts.$inferSelect;

  const research = await db.query.leadResearch.findFirst({
    where: eq(leadResearch.leadId, leadId),
  });

  // Get the most recent outreach email sent to this lead
  const originalOutreach = await db.query.leadOutreach.findFirst({
    where: eq(leadOutreach.leadId, leadId),
    orderBy: [desc(leadOutreach.createdAt)],
  });

  const replyContent = (lead as typeof leads.$inferSelect & { lastReplyContent?: string | null }).lastReplyContent;

  if (!replyContent) {
    throw new Error("No reply content available to draft a response");
  }

  const systemPrompt = `You are ISH's sales writer. You craft warm, specific, natural email replies for a corporate gifting company, India Sweet House (ISH).

Output ONLY valid JSON:
{
  "subjectA": "string (Re: + original subject or relevant follow-on)",
  "subjectB": "string (alternative subject)",
  "emailBody": "string (plain text, max 120 words, natural and conversational)",
  "outreachGoal": "one sentence describing the goal of this reply"
}`;

  const userPrompt = `Draft a reply to a prospect who responded to our outreach.

Prospect: ${contact.firstName ?? contact.name}, ${contact.title ?? "HR/Admin"} at ${account.name}
Industry: ${account.industry ?? "Corporate"}, City: ${account.city ?? "India"}
Team size: ${account.employees ?? "100+"} employees
Gifting hook: ${research?.giftingHook ?? "Diwali season gifting"}

Our original email:
"""
${originalOutreach?.emailBody ?? "We reached out about Diwali corporate gifting."}
"""

Their reply:
"""
${replyContent}
"""

Instructions:
- Respond naturally and specifically to what they said
- Move toward the next step: booking a call, confirming a sample, or answering their question
- Keep it warm, short, and human. No corporate fluff
- Sign off with sender first name only
- Max 120 words`;

  const raw = await callLLM({
    tier: "fast",
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 512,
  });

  let parsed: { subjectA?: string; subjectB?: string; emailBody?: string; outreachGoal?: string } = {};
  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    parsed = {
      subjectA: `Re: Diwali gifting for ${account.name}`,
      subjectB: `Following up on your reply`,
      emailBody: raw.slice(0, 600),
      outreachGoal: "Continue conversation and book next step",
    };
  }

  const threadRoot =
    (lead as typeof leads.$inferSelect & { threadRootSubject?: string | null }).threadRootSubject ??
    (originalOutreach?.subjectA ? stripReplyPrefix(originalOutreach.subjectA) : `Diwali gifting for ${account.name}`);

  const emailBody = parsed.emailBody ?? "";
  const subjectA = normalizeReplySubject(parsed.subjectA ? stripReplyPrefix(parsed.subjectA) : threadRoot);
  const subjectB = normalizeReplySubject(parsed.subjectB ? stripReplyPrefix(parsed.subjectB) : threadRoot);
  const outreachGoal = parsed.outreachGoal ?? "Continue conversation";

  const contactFirstName = contact.firstName ?? contact.name.split(" ")[0];
  const spamResult = scoreSpamMeter(emailBody, subjectA, {
    emailStyle: emailConfig.emailStyle,
    fromName: emailConfig.fromName,
    contactFirstName,
  });
  const delivScore = spamResult.inboxScore;

  const [outreach] = await db
    .insert(leadOutreach)
    .values({
      leadId,
      promptVersion: PROMPT_VERSION,
      draftSource: "llm",
      subjectA,
      subjectB,
      emailBody,
      deliverabilityScore: delivScore,
      deliverabilityVerdict: deliverabilityVerdict(delivScore),
      revisionCount: 0,
      templateVariant: "reply",
      outreachGoal,
      confidenceTier: research?.confidenceTier ?? "low",
    })
    .returning();

  return outreach.id;
}
