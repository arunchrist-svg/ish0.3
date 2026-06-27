import { callLLM } from "@/lib/llm";
import { db, leadOutreach, outreachEditMessages, leads, contacts, accounts } from "@/db";
import { eq, asc } from "drizzle-orm";
import {
  scoreDeliverability,
  deliverabilityVerdict,
} from "@/lib/agents/writer-scoring";
import { toWriterDraft, toEditMessage } from "@/lib/agents/writer-draft";
import { getOutreachTemplate } from "@/lib/email/outreach-templates";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { scoreSpamMeter } from "@/lib/agents/writer-scoring";
import { getAntiSpamWritingRules } from "@/lib/email/content-rules-prompt";
import {
  buildContentScoreImproveMessage,
  isContentScoreImproveRequest,
} from "@/lib/email/content-score-fixes";

const MAX_HISTORY_IN_PROMPT = 20;

function formatHistory(messages: { role: string; content: string }[]): string {
  if (messages.length === 0) return "(no prior edits)";
  return messages
    .slice(-MAX_HISTORY_IN_PROMPT)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
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

  const contact = lead.contact as typeof contacts.$inferSelect;
  const account = lead.account as typeof accounts.$inferSelect;
  const emailConfig = await getResolvedEmailConfig(lead.workspaceId);
  const senderFirstName = emailConfig.fromName.split(" ")[0] || emailConfig.fromName;
  const contactFirstName = contact.firstName ?? contact.name.split(" ")[0];
  const template = getOutreachTemplate(outreach.templateVariant ?? undefined);

  const priorMessages = await db.query.outreachEditMessages.findMany({
    where: eq(outreachEditMessages.leadOutreachId, leadOutreachId),
    orderBy: [asc(outreachEditMessages.createdAt)],
  });

  const systemPrompt = `You are ISH's outreach editor. Revise corporate gifting emails based on user feedback.
Keep warm Indian B2B tone. Max 120 words. Open with "Hi {firstName},".
${getAntiSpamWritingRules({
  sequencePosition: 1,
  senderFirstName,
  brandName: emailConfig.brandConfig?.brandName ?? emailConfig.fromName,
  emailStyle: emailConfig.emailStyle,
  hasVerifiedEmployeeCount: Boolean(account.employees?.trim()),
})}

IMPORTANT:
- Always return the FULL updated subjectA, subjectB, and emailBody, not just a summary.
- If the user asks to change "title", "subject", "greeting", or "salutation", update the subject line(s) AND the opening line of the email body to match.
- "Hi [Name]" requests should change both subject (if relevant) and body opening from "Dear Dr. ..." to "Hi [FirstName],".
- changeSummary must only describe changes you actually made in the returned fields.

Output ONLY valid JSON:
{
  "subjectA": "string",
  "subjectB": "string",
  "emailBody": "string",
  "changeSummary": "one short sentence describing what you changed"
}`;

  const delivOpts = {
    emailStyle: emailConfig.emailStyle,
    fromName: emailConfig.fromName,
    contactFirstName,
    sequencePosition: 1,
    account: {
      name: account.name,
      employees: account.employees,
      industry: account.industry,
      city: account.city,
      enrichmentSource: contact.enrichmentSource,
    },
    contact: { firstName: contactFirstName, title: contact.title },
  };

  let effectiveMessage = userMessage;
  if (isContentScoreImproveRequest(userMessage)) {
    const currentSpam = scoreSpamMeter(
      outreach.emailBody ?? "",
      outreach.subjectA ?? "",
      delivOpts,
    );
    effectiveMessage = buildContentScoreImproveMessage(currentSpam.factors, currentSpam.inboxScore);
  }

  const userPrompt = `Current draft:
Subject A: ${outreach.subjectA ?? ""}
Subject B: ${outreach.subjectB ?? ""}
Body:
${outreach.emailBody ?? ""}

Contact: ${contact.firstName ?? contact.name}, ${contact.title ?? "HR/Admin"}
Company: ${account.name}, ${account.city ?? "India"}
Template goal: ${template.label}: ${template.ctaInstruction}

Edit history:
${formatHistory(priorMessages)}

User instruction: ${effectiveMessage}

Apply the instruction to the full draft above. Keep personalisation for ${contact.firstName ?? contact.name} and ${account.name}.
Return complete revised subjectA, subjectB, and emailBody reflecting every change requested.`;

  const raw = await callLLM({
    tier: "fast",
    system: systemPrompt,
    prompt: userPrompt,
    maxTokens: 1024,
  });

  let parsed: {
    subjectA?: string;
    subjectB?: string;
    emailBody?: string;
    changeSummary?: string;
  } = {};

  try {
    parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    throw new Error("Could not parse revised draft from AI");
  }

  const subjectA = parsed.subjectA ?? outreach.subjectA ?? "";
  const subjectB = parsed.subjectB ?? outreach.subjectB ?? "";
  const emailBody = parsed.emailBody ?? outreach.emailBody ?? "";
  let changeSummary = parsed.changeSummary ?? "Updated draft per your feedback";

  const unchanged =
    subjectA === (outreach.subjectA ?? "") &&
    subjectB === (outreach.subjectB ?? "") &&
    emailBody === (outreach.emailBody ?? "");

  if (unchanged) {
    changeSummary = "No visible changes applied. Try being more specific (e.g. change greeting to Hi Vikram).";
  }

  const spamResult = scoreSpamMeter(emailBody, subjectA, delivOpts);
  const delivScore = spamResult.inboxScore;
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
