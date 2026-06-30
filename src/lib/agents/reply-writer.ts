import { callLLM } from "@/lib/llm";
import { db, leadOutreach, leads, contacts, accounts, leadResearch, outreachSchedule } from "@/db";
import { eq, and, asc } from "drizzle-orm";
import {
  scoreSpamMeter,
  deliverabilityVerdict,
  DELIVERABILITY_PASS_THRESHOLD,
  RUBRIC_PASS_THRESHOLD,
  scoreRubric,
  scoreRubricTotal,
  getCombinedRevisionIssues,
} from "@/lib/agents/writer-scoring";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { normalizeReplySubject, stripReplyPrefix } from "@/lib/email/threading";
import { getRevisionInstruction } from "@/lib/email/content-rules-prompt";
import { getWriterTonePersona } from "@/lib/agents/writer-tone";
import { extractLatestReplyText } from "@/lib/email/reply-body";
import { getReplyCtaInstruction, REPLY_SEQUENCE_POSITION } from "@/lib/email/outreach-templates";
import { extractPriorCta } from "@/lib/email/reply-intent";
import { classifyReplyIntentAsync } from "@/lib/email/reply-intent-llm";
import { generateReplyPlan, formatReplyPlanForPrompt } from "@/lib/agents/reply-planner";
import { tierForAgentStep } from "@/lib/llm/routing-policy";
import { auditContentScored } from "@/lib/email/feedback-hooks";
import { pickOriginalEmailContext } from "@/lib/email/reply-context";

const PROMPT_VERSION = "v2.0-planner-quality";
const MAX_REVISIONS = 2;

export type ReplyWriterResult = {
  outreachId: string;
  rubricTotal: number;
  intent: string;
};

export async function runReplyWriter(leadId: string): Promise<ReplyWriterResult> {
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, leadId),
    with: { contact: true, account: true },
  });

  if (!lead) throw new Error(`Lead ${leadId} not found`);

  const emailConfig = await getResolvedEmailConfig(lead.workspaceId);
  const senderFirstName = emailConfig.fromName.split(" ")[0] || emailConfig.fromName;
  const contact = lead.contact as typeof contacts.$inferSelect;
  const account = lead.account as typeof accounts.$inferSelect;
  const contactFirstName = contact.firstName ?? contact.name.split(" ")[0];

  const research = await db.query.leadResearch.findFirst({
    where: eq(leadResearch.leadId, leadId),
  });

  const sentScheduleRows = await db
    .select()
    .from(outreachSchedule)
    .where(and(eq(outreachSchedule.leadId, leadId), eq(outreachSchedule.status, "sent")))
    .orderBy(asc(outreachSchedule.sentAt));

  const outreachRows = await db.query.leadOutreach.findMany({
    where: eq(leadOutreach.leadId, leadId),
  });

  const originalContext = pickOriginalEmailContext({ sentScheduleRows, outreachRows });

  const replyRaw = (lead as typeof leads.$inferSelect & { lastReplyContent?: string | null }).lastReplyContent;
  const replyContent = extractLatestReplyText(replyRaw);

  if (!replyContent) {
    throw new Error("No reply content available to draft a response");
  }

  const priorCta = extractPriorCta(originalContext.emailBody);
  const replyIntent = await classifyReplyIntentAsync(replyContent, priorCta, {
    tenantId: lead.tenantId,
    workspaceId: lead.workspaceId,
    leadId,
  });
  const replyCtaInstruction = getReplyCtaInstruction(originalContext.templateVariant, replyIntent.intent);

  const brandConfig = emailConfig.brandConfig ?? {
    brandSlug: "ish" as const,
    brandName: "India Sweet House",
    vertical: "sweets_gifting",
    productSummary: "",
    buyerPersonas: [],
  };

  const intentBlock = [
    `Reply intent: ${replyIntent.intent}${replyIntent.agreedTo ? ` (agreed to ${replyIntent.agreedTo})` : ""}`,
    priorCta ? `Prior CTA they answered: "${priorCta}"` : null,
    `Next CTA (required): ${replyCtaInstruction}`,
    replyIntent.intent === "affirmative"
      ? "Never repeat the prior CTA question they already answered affirmatively."
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const replyPlan = await generateReplyPlan({
    contactFirstName,
    companyName: account.name,
    originalEmail: originalContext.emailBody,
    replyContent,
    intent: replyIntent,
    replyCtaInstruction,
    giftingHook: research?.giftingHook,
    tenantId: lead.tenantId,
    workspaceId: lead.workspaceId,
    leadId,
  });


  const systemPrompt = `You are ${brandConfig.brandName}'s reply writer. Craft specific, natural email replies.
${getWriterTonePersona(brandConfig)}

Output ONLY valid JSON:
{
  "subjectA": "string (Re: + original subject or relevant follow-on)",
  "subjectB": "string (alternative subject)",
  "emailBody": "string (plain text, max 120 words, natural and conversational)",
  "outreachGoal": "one sentence describing the goal of this reply"
}`;

  const userPrompt = `Draft a reply to a prospect who responded to our outreach.

Prospect: ${contactFirstName}, ${contact.title ?? "HR/Admin"} at ${account.name}
Industry: ${account.industry ?? "Corporate"}, City: ${account.city ?? "India"}
Gifting hook: ${research?.giftingHook ?? "Diwali season gifting"}

Our original email:
"""
${originalContext.emailBody}
"""

Their reply:
"""
${replyContent}
"""

${intentBlock}

${formatReplyPlanForPrompt(replyPlan)}

Instructions:
- Respond naturally and specifically to what they said
- Follow the Next CTA above. Do not re-ask questions they already answered.
- Keep it friendly but professional, short, and human. Not salesy, no fluff
- Never use em dashes. One question CTA only.
- Never cite employee counts or numeric company stats.
- Sign off with sender first name only
- Max 120 words`;

  const delivOpts = {
    emailStyle: emailConfig.emailStyle,
    fromName: emailConfig.fromName,
    contactFirstName,
    sequencePosition: REPLY_SEQUENCE_POSITION,
    isReplyDraft: true,
    replyIntent: replyIntent.intent,
    priorCta,
    account: {
      name: account.name,
      employees: account.employees,
      industry: account.industry,
      city: account.city,
      enrichmentSource: contact.enrichmentSource,
    },
    contact: { firstName: contactFirstName, title: contact.title },
    giftingHook: research?.giftingHook,
  };

  const rubricParams = {
    contact: { name: contact.name, firstName: contactFirstName, title: contact.title },
    account: {
      name: account.name,
      industry: account.industry,
      city: account.city,
      employees: account.employees,
    },
    deliverabilityOptions: delivOpts,
    giftingHook: research?.giftingHook,
    intelNotes: account.intelNotes,
  };

  const threadRoot =
    (lead as typeof leads.$inferSelect & { threadRootSubject?: string | null }).threadRootSubject ??
    (originalContext.subjectA ? stripReplyPrefix(originalContext.subjectA) : `Diwali gifting for ${account.name}`);

  let emailBody = "";
  let subjectA = normalizeReplySubject(threadRoot);
  let subjectB = normalizeReplySubject(threadRoot);
  let outreachGoal = "Continue conversation";

  for (let attempt = 0; attempt <= MAX_REVISIONS; attempt++) {
    const raw = await callLLM({
      tier: tierForAgentStep("reply.write"),
      system: systemPrompt,
      prompt:
        attempt === 0
          ? userPrompt
          : `${userPrompt}\n\n${getRevisionInstruction(
              await getCombinedRevisionIssues(emailBody, subjectA, {
                subjectA,
                emailBody,
                ...rubricParams,
              }),
            )}`,
      maxTokens: 512,
    });

    let parsed: { subjectA?: string; subjectB?: string; emailBody?: string; outreachGoal?: string } = {};
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      parsed = {
        subjectA: `Re: Diwali gifting for ${account.name}`,
        subjectB: `Re: ${contactFirstName} reply`,
        emailBody: raw.slice(0, 600),
        outreachGoal: "Continue conversation and book next step",
      };
    }

    emailBody = parsed.emailBody ?? "";
    subjectA = normalizeReplySubject(parsed.subjectA ? stripReplyPrefix(parsed.subjectA) : threadRoot);
    subjectB = normalizeReplySubject(parsed.subjectB ? stripReplyPrefix(parsed.subjectB) : threadRoot);
    outreachGoal = parsed.outreachGoal ?? outreachGoal;

    const spamResult = scoreSpamMeter(emailBody, subjectA, delivOpts);
    const rubric = await scoreRubric({ subjectA, emailBody, ...rubricParams });
    const passesQuality =
      spamResult.inboxScore >= DELIVERABILITY_PASS_THRESHOLD &&
      scoreRubricTotal(rubric) >= RUBRIC_PASS_THRESHOLD;

    if (passesQuality || attempt === MAX_REVISIONS) break;
  }

  const finalSpam = scoreSpamMeter(emailBody, subjectA, delivOpts);
  const delivScore = finalSpam.inboxScore;

  const finalRubric = await scoreRubric({ subjectA, emailBody, ...rubricParams });
  const rubricTotal = scoreRubricTotal(finalRubric);

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
      rubricScore: finalRubric,
      rubricTotal,
      revisionCount: MAX_REVISIONS,
      templateVariant: "reply",
      sequencePosition: REPLY_SEQUENCE_POSITION,
      outreachGoal,
      confidenceTier: research?.confidenceTier ?? "low",
    })
    .returning();

  void auditContentScored({
    tenantId: lead.tenantId,
    workspaceId: lead.workspaceId,
    leadId,
    leadOutreachId: outreach.id,
    contentScore: delivScore,
    ruleHits: finalSpam.ruleHits ?? [],
    sequencePosition: REPLY_SEQUENCE_POSITION,
  });

  return { outreachId: outreach.id, rubricTotal, intent: replyIntent.intent };
}
