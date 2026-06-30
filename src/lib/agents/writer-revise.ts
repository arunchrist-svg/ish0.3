import { callLLM } from "@/lib/llm";
import { tierForAgentStep } from "@/lib/llm/routing-policy";
import { db, leadOutreach, outreachEditMessages, leads, contacts, accounts, leadResearch, outreachSchedule } from "@/db";
import { eq, asc, and } from "drizzle-orm";
import {
  scoreSpamMeter,
  deliverabilityVerdict,
  DELIVERABILITY_PASS_THRESHOLD,
  RUBRIC_PASS_THRESHOLD,
  scoreRubric,
  scoreRubricTotal,
  getCombinedRevisionIssues,
  getDeliverabilityIssues,
} from "@/lib/agents/writer-scoring";
import { toWriterDraft, toEditMessage } from "@/lib/agents/writer-draft";
import { getOutreachTemplate, getReplyCtaInstruction, REPLY_SEQUENCE_POSITION } from "@/lib/email/outreach-templates";
import { classifyReplyIntent, extractPriorCta } from "@/lib/email/reply-intent";
import { pickOriginalEmailContext } from "@/lib/email/reply-context";
import { extractLatestReplyText } from "@/lib/email/reply-body";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { getAntiSpamWritingRules, getRevisionInstruction, getStyleOnlyRevisionInstruction } from "@/lib/email/content-rules-prompt";
import { getWriterTonePersona } from "@/lib/agents/writer-tone";
import {
  buildContentScoreImproveMessage,
  isContentScoreImproveRequest,
} from "@/lib/email/content-score-fixes";
import {
  bodyChangeRatio,
  detectEditIntent,
  isStyleOnlyEdit,
  mentionsSubject,
  type EditIntent,
} from "@/lib/email/edit-intent";
import { normalizeEmailBody, EMAIL_BODY_FORMAT_RULE } from "@/lib/email/email-body-format";

const MAX_HISTORY_IN_PROMPT = 20;
const MAX_REVISIONS = 1;
const SURGICAL_CHANGE_THRESHOLD = 0.25;

function formatHistory(messages: { role: string; content: string }[]): string {
  if (messages.length === 0) return "(no prior edits)";
  return messages
    .slice(-MAX_HISTORY_IN_PROMPT)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
}

function buildSystemPrompt(params: {
  brandName: string;
  tonePersona: string;
  antiSpamRules: string;
  intent: EditIntent;
  styleOnly: boolean;
}): string {
  const { brandName, tonePersona, antiSpamRules, intent, styleOnly } = params;

  const importantBlock =
    intent === "surgical"
      ? `IMPORTANT (SURGICAL EDIT):
- Change ONLY what the user explicitly asked for.
- Copy every unchanged sentence word for word from the current draft.
- Do not rephrase, reorder, shorten, or improve unrelated parts.
- If the instruction does not mention subject, title, greeting, or salutation, return subjectA and subjectB IDENTICAL to the current values.
- Still return full subjectA, subjectB, and emailBody fields in JSON, but unchanged fields must match the input exactly.
- changeSummary must only describe the specific change you made.`
      : styleOnly
        ? `IMPORTANT (STYLE-ONLY EDIT):
- Apply ONLY the stylistic change the user asked for (tone, length, or CTA strength).
- Do NOT add new facts, job titles, research hooks, industry details, or intel not already in the draft.
- Keep existing facts and personalization; rephrase wording only.
- changeSummary must describe only the tone/length/CTA change, not new research added.`
        : `IMPORTANT:
- Always return the FULL updated subjectA, subjectB, and emailBody, not just a summary.
- If the user asks to change "title", "subject", "greeting", or "salutation", update the subject line(s) AND the opening line of the email body to match.
- "Hi [Name]" requests should change both subject (if relevant) and body opening from "Dear Dr. ..." to "Hi [FirstName],".
- changeSummary must only describe changes you actually made in the returned fields.`;

  return `You are ${brandName}'s outreach editor. Revise emails based on user feedback.
${tonePersona}
Max 120 words. Open with "Hi {firstName},".
${antiSpamRules}
${EMAIL_BODY_FORMAT_RULE}

${importantBlock}

Output ONLY valid JSON:
{
  "subjectA": "string",
  "subjectB": "string",
  "emailBody": "string",
  "changeSummary": "one short sentence describing what you changed"
}`;
}

function buildUserPrompt(params: {
  subjectA: string;
  subjectB: string;
  emailBody: string;
  contactLine: string;
  companyLine: string;
  templateGoal: string;
  history: string;
  effectiveMessage: string;
  contactFirstName: string;
  companyName: string;
  intent: EditIntent;
  styleOnly: boolean;
}): string {
  const {
    subjectA,
    subjectB,
    emailBody,
    contactLine,
    companyLine,
    templateGoal,
    history,
    effectiveMessage,
    contactFirstName,
    companyName,
    intent,
    styleOnly,
  } = params;

  const closingInstruction =
    intent === "surgical"
      ? `Make the smallest edit that satisfies the instruction. Preserve all other text exactly.`
      : styleOnly
        ? `Apply only the stylistic change requested. Do not add new research, role titles, or hooks. Preserve facts already in the draft.`
        : `Apply the instruction to the full draft above. Keep personalization for ${contactFirstName} and ${companyName}.
Return complete revised subjectA, subjectB, and emailBody reflecting every change requested.`;

  return `Current draft:
Subject A: ${subjectA}
Subject B: ${subjectB}
Body:
${emailBody}

Contact: ${contactLine}
Company: ${companyLine}
Template goal: ${templateGoal}

Edit history:
${history}

User instruction: ${effectiveMessage}

The user's edit request overrides template defaults. Apply their instruction even if it differs from the template goal.

${closingInstruction}`;
}

const SURGICAL_RETRY_NOTE =
  "Your last edit changed too much unrelated text. Change ONLY what the user asked. Copy all other sentences verbatim from Current draft.";

type ParsedDraft = {
  subjectA?: string;
  subjectB?: string;
  emailBody?: string;
  changeSummary?: string;
};

async function callReviseLLM(params: {
  systemPrompt: string;
  userPrompt: string;
  extraNote?: string;
}): Promise<ParsedDraft> {
  const raw = await callLLM({
    tier: tierForAgentStep("writer.revise"),
    system: params.systemPrompt,
    prompt: params.extraNote ? `${params.userPrompt}\n\n${params.extraNote}` : params.userPrompt,
    maxTokens: 1024,
  });

  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim()) as ParsedDraft;
  } catch {
    throw new Error("Could not parse revised draft from AI");
  }
}

function applySubjectLock(params: {
  intent: EditIntent;
  userMessage: string;
  originalSubjectA: string;
  originalSubjectB: string;
  subjectA: string;
  subjectB: string;
}): { subjectA: string; subjectB: string } {
  if (params.intent !== "surgical" || mentionsSubject(params.userMessage)) {
    return { subjectA: params.subjectA, subjectB: params.subjectB };
  }
  return {
    subjectA: params.originalSubjectA,
    subjectB: params.originalSubjectB,
  };
}

export async function reviseWriter(leadOutreachId: string, userMessage: string) {
  const outreach = await db.query.leadOutreach.findFirst({
    where: eq(leadOutreach.id, leadOutreachId),
  });

  if (!outreach) throw new Error(`Draft ${leadOutreachId} not found`);

  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, outreach.leadId),
    with: { contact: true, account: true },
  });

  if (!lead) throw new Error(`Lead ${outreach.leadId} not found`);

  const research = await db.query.leadResearch.findFirst({
    where: eq(leadResearch.leadId, outreach.leadId),
  });

  const contact = lead.contact as typeof contacts.$inferSelect;
  const account = lead.account as typeof accounts.$inferSelect;
  const emailConfig = await getResolvedEmailConfig(lead.workspaceId);
  const senderFirstName = emailConfig.fromName.split(" ")[0] || emailConfig.fromName;
  const contactFirstName = contact.firstName ?? contact.name.split(" ")[0];
  const isReplyDraft = outreach.templateVariant === "reply";
  const sequencePosition = isReplyDraft
    ? REPLY_SEQUENCE_POSITION
    : (outreach.sequencePosition ?? 1);
  const brandConfig = emailConfig.brandConfig ?? {
    brandSlug: "ish" as const,
    brandName: emailConfig.fromName,
    vertical: "general",
    productSummary: "",
    buyerPersonas: [],
  };
  const template = getOutreachTemplate(
    isReplyDraft ? undefined : (outreach.templateVariant ?? undefined),
  );

  let templateGoal = `${template.label}: ${template.ctaInstruction}`;
  let replyPriorCta: string | null = null;
  let replyIntent = classifyReplyIntent("", null);

  if (isReplyDraft) {
    const sentScheduleRows = await db
      .select()
      .from(outreachSchedule)
      .where(and(eq(outreachSchedule.leadId, outreach.leadId), eq(outreachSchedule.status, "sent")))
      .orderBy(asc(outreachSchedule.sentAt));

    const outreachRows = await db.query.leadOutreach.findMany({
      where: eq(leadOutreach.leadId, outreach.leadId),
    });

    const originalContext = pickOriginalEmailContext({ sentScheduleRows, outreachRows });
    const replyRaw = (lead as typeof leads.$inferSelect & { lastReplyContent?: string | null }).lastReplyContent;
    const replyContent = extractLatestReplyText(replyRaw) ?? "";
    replyPriorCta = extractPriorCta(originalContext.emailBody);
    replyIntent = classifyReplyIntent(replyContent, replyPriorCta);
    templateGoal = getReplyCtaInstruction(originalContext.templateVariant, replyIntent.intent);
  }

  const priorMessages = await db.query.outreachEditMessages.findMany({
    where: eq(outreachEditMessages.leadOutreachId, leadOutreachId),
    orderBy: [asc(outreachEditMessages.createdAt)],
  });

  const delivOpts = {
    emailStyle: emailConfig.emailStyle,
    fromName: emailConfig.fromName,
    contactFirstName,
    sequencePosition,
    isReplyDraft,
    replyIntent: isReplyDraft ? replyIntent.intent : undefined,
    priorCta: isReplyDraft ? replyPriorCta : undefined,
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

  let effectiveMessage = userMessage;
  if (isContentScoreImproveRequest(userMessage)) {
    const currentSpam = scoreSpamMeter(outreach.emailBody ?? "", outreach.subjectA ?? "", delivOpts);
    const rubric = await scoreRubric({
      subjectA: outreach.subjectA ?? "",
      emailBody: outreach.emailBody ?? "",
      ...rubricParams,
    });
    const rubricIssues =
      scoreRubricTotal(rubric) < RUBRIC_PASS_THRESHOLD
        ? ` Also improve rubric score (currently ${scoreRubricTotal(rubric)}/100).`
        : "";
    effectiveMessage =
      buildContentScoreImproveMessage(currentSpam.factors, currentSpam.inboxScore) + rubricIssues;
  }

  const intent = detectEditIntent(effectiveMessage);
  const styleOnly = isStyleOnlyEdit(userMessage);

  const antiSpamRules = getAntiSpamWritingRules({
    sequencePosition,
    senderFirstName,
    brandName: emailConfig.brandConfig?.brandName ?? emailConfig.fromName,
    emailStyle: emailConfig.emailStyle,
    isReplyDraft,
  });

  const systemPrompt = buildSystemPrompt({
    brandName: brandConfig.brandName,
    tonePersona: getWriterTonePersona(brandConfig),
    antiSpamRules,
    intent,
    styleOnly,
  });

  const originalSubjectA = outreach.subjectA ?? "";
  const originalSubjectB = outreach.subjectB ?? "";
  const originalBody = outreach.emailBody ?? "";

  const baseUserPrompt = buildUserPrompt({
    subjectA: originalSubjectA,
    subjectB: originalSubjectB,
    emailBody: originalBody,
    contactLine: `${contact.firstName ?? contact.name}, ${contact.title ?? "HR/Admin"}`,
    companyLine: `${account.name}, ${account.city ?? "India"}`,
    templateGoal,
    history: formatHistory(priorMessages),
    effectiveMessage,
    contactFirstName: contactFirstName ?? contact.name,
    companyName: account.name,
    intent,
    styleOnly,
  });

  let subjectA = originalSubjectA;
  let subjectB = originalSubjectB;
  let emailBody = originalBody;
  let changeSummary = "Updated draft per your feedback";
  let surgicalRetried = false;

  for (let attempt = 0; attempt <= MAX_REVISIONS; attempt++) {
    const extraNote =
      attempt === 0
        ? undefined
        : intent === "surgical"
          ? SURGICAL_RETRY_NOTE
          : styleOnly
            ? getStyleOnlyRevisionInstruction(
                await getDeliverabilityIssues(emailBody, subjectA, delivOpts),
              )
            : getRevisionInstruction(
                await getCombinedRevisionIssues(emailBody, subjectA, {
                  subjectA,
                  emailBody,
                  ...rubricParams,
                }),
              );

    const parsed = await callReviseLLM({ systemPrompt, userPrompt: baseUserPrompt, extraNote });

    subjectA = parsed.subjectA ?? subjectA;
    subjectB = parsed.subjectB ?? subjectB;
    emailBody = normalizeEmailBody(parsed.emailBody ?? emailBody);
    changeSummary = parsed.changeSummary ?? changeSummary;

    const locked = applySubjectLock({
      intent,
      userMessage: effectiveMessage,
      originalSubjectA,
      originalSubjectB,
      subjectA,
      subjectB,
    });
    subjectA = locked.subjectA;
    subjectB = locked.subjectB;

    const spamResult = scoreSpamMeter(emailBody, subjectA, delivOpts);
    const rubric = await scoreRubric({ subjectA, emailBody, ...rubricParams });
    const passesQuality =
      spamResult.inboxScore >= DELIVERABILITY_PASS_THRESHOLD &&
      scoreRubricTotal(rubric) >= RUBRIC_PASS_THRESHOLD;

    if (intent === "surgical") {
      const ratio = bodyChangeRatio(originalBody, emailBody);
      if (ratio > SURGICAL_CHANGE_THRESHOLD && !surgicalRetried) {
        surgicalRetried = true;
        const retryParsed = await callReviseLLM({
          systemPrompt,
          userPrompt: baseUserPrompt,
          extraNote: SURGICAL_RETRY_NOTE,
        });
        subjectA = retryParsed.subjectA ?? subjectA;
        subjectB = retryParsed.subjectB ?? subjectB;
        emailBody = normalizeEmailBody(retryParsed.emailBody ?? emailBody);
        changeSummary = retryParsed.changeSummary ?? changeSummary;

        const retryLocked = applySubjectLock({
          intent,
          userMessage: effectiveMessage,
          originalSubjectA,
          originalSubjectB,
          subjectA,
          subjectB,
        });
        subjectA = retryLocked.subjectA;
        subjectB = retryLocked.subjectB;

        const retryRatio = bodyChangeRatio(originalBody, emailBody);
        if (retryRatio > SURGICAL_CHANGE_THRESHOLD) {
          changeSummary =
            "Applied your change; some surrounding wording may have shifted. Try quoting the exact line to change.";
        }
      }
      break;
    }

    if (styleOnly && spamResult.inboxScore >= DELIVERABILITY_PASS_THRESHOLD) break;

    if (passesQuality || attempt === MAX_REVISIONS) break;
  }

  const unchanged =
    subjectA === originalSubjectA && subjectB === originalSubjectB && emailBody === originalBody;

  if (unchanged) {
    changeSummary = "No visible changes applied. Try being more specific (e.g. change greeting to Hi Vikram).";
  }

  emailBody = normalizeEmailBody(emailBody);

  const finalSpam = scoreSpamMeter(emailBody, subjectA, delivOpts);
  const delivScore = finalSpam.inboxScore;
  const revisionCount = (outreach.revisionCount ?? 0) + 1;

  const [updated] = await db
    .update(leadOutreach)
    .set({
      subjectA,
      subjectB,
      emailBody,
      deliverabilityScore: delivScore,
      deliverabilityVerdict: deliverabilityVerdict(delivScore),
      revisionCount,
    })
    .where(eq(leadOutreach.id, leadOutreachId))
    .returning();

  await db.insert(outreachEditMessages).values([
    { leadOutreachId, role: "user", content: userMessage },
    { leadOutreachId, role: "assistant", content: changeSummary },
  ]);

  const allMessages = await db.query.outreachEditMessages.findMany({
    where: eq(outreachEditMessages.leadOutreachId, leadOutreachId),
    orderBy: [asc(outreachEditMessages.createdAt)],
  });

  return {
    draft: toWriterDraft(updated, {
      approvalStatus: "pending",
      editMessages: allMessages,
    }),
    messages: allMessages.map(toEditMessage),
  };
}
