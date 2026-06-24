import { callLLM } from "@/lib/llm";
import { db, leadOutreach, outreachEditMessages, leads, contacts, accounts } from "@/db";
import { eq, asc } from "drizzle-orm";
import {
  scoreDeliverability,
  scoreRubric,
  deliverabilityVerdict,
} from "@/lib/agents/writer-scoring";
import { toWriterDraft, toEditMessage } from "@/lib/agents/writer-draft";
import { getOutreachTemplate } from "@/lib/email/outreach-templates";

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
  const template = getOutreachTemplate(outreach.templateVariant ?? undefined);

  const priorMessages = await db.query.outreachEditMessages.findMany({
    where: eq(outreachEditMessages.leadOutreachId, leadOutreachId),
    orderBy: [asc(outreachEditMessages.createdAt)],
  });

  const systemPrompt = `You are ISH's outreach editor. Revise corporate gifting emails based on user feedback.
Keep warm Indian B2B tone. Max 150 words in body. Sign off with "ISH Gifting Team".

IMPORTANT:
- Always return the FULL updated subjectA, subjectB, and emailBody — not just a summary.
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

  const userPrompt = `Current draft:
Subject A: ${outreach.subjectA ?? ""}
Subject B: ${outreach.subjectB ?? ""}
Body:
${outreach.emailBody ?? ""}

Contact: ${contact.firstName ?? contact.name}, ${contact.title ?? "HR/Admin"}
Company: ${account.name}, ${account.city ?? "India"}
Template goal: ${template.label} — ${template.ctaInstruction}

Edit history:
${formatHistory(priorMessages)}

User instruction: ${userMessage}

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
    changeSummary = "No visible changes applied — try being more specific (e.g. change greeting to Hi Vikram).";
  }

  const delivScore = await scoreDeliverability(emailBody, subjectA);
  const rubric = await scoreRubric({ subjectA, emailBody, contact, account });
  const rubricTotal = Object.values(rubric).reduce((s, v) => s + v, 0);
  const revisionCount = (outreach.revisionCount ?? 0) + 1;

  const [updated] = await db
    .update(leadOutreach)
    .set({
      subjectA,
      subjectB,
      emailBody,
      deliverabilityScore: delivScore,
      deliverabilityVerdict: deliverabilityVerdict(delivScore),
      rubricScore: rubric as Record<string, number>,
      rubricTotal,
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
