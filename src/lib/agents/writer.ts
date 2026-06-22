import { callLLM } from "@/lib/llm";
import { retrieveRelevantRules } from "@/lib/rag";
import { db, leadOutreach, leads, contacts, accounts, leadResearch, yieldFunnel } from "@/db";
import { eq } from "drizzle-orm";
import { isManualStage } from "@/lib/pipeline-status";
import { getOutreachTemplate, type OutreachTemplateId } from "@/lib/email/outreach-templates";

const PROMPT_VERSION = "v1.2";
const MAX_REVISIONS = 2;

// 4-dimension rubric (max 25 each = 100 total)
const RUBRIC_DIMENSIONS = ["personalisation", "clarity", "cta_strength", "deliverability"] as const;
const DELIVERABILITY_PASS_THRESHOLD = 70;

const FEW_SHOT = `
---
EXAMPLE (High confidence, IT company):
Subject A: Diwali gifts for TechCorp's 800 employees — India Sweet House
Subject B: A sweeter Diwali for your team, Priya
Body:
Dear Priya,

With Diwali in 6 weeks, our premium mithai and dry fruit hampers are booking fast. For TechCorp's 800+ team, our bulk pricing starts at ₹600/person — pure ghee, custom-branded boxes, pan-India delivery.

Can we schedule a 15-min call this week to confirm quantities?

Warm regards,
ISH Gifting Team

---
EXAMPLE (Low confidence, generic):
Subject A: ISH Diwali gifting for your team
Subject B: Diwali hampers for corporate teams
Body:
Dear [Name],

India Sweet House offers premium Diwali gift hampers for corporate teams. Pricing starts at ₹500/person.

Interested? Reply to this email or call us.

Warm regards,
ISH Gifting Team
---
`;

export type WriterOptions = {
  outreachTemplate?: OutreachTemplateId;
};

export async function runWriter(leadId: string, options?: WriterOptions): Promise<string> {
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, leadId),
    with: { contact: true, account: true },
  });

  if (!lead) throw new Error(`Lead ${leadId} not found`);

  if (isManualStage(lead.status)) {
    throw new Error(`Cannot generate draft for lead in ${lead.status} stage`);
  }

  const contact = lead.contact as typeof contacts.$inferSelect;
  const account = lead.account as typeof accounts.$inferSelect;

  const research = await db.query.leadResearch.findFirst({
    where: eq(leadResearch.leadId, leadId),
  });

  const rules = retrieveRelevantRules({
    industry: account.industry ?? undefined,
    city: account.city ?? undefined,
    season: "diwali",
  });

  const confidenceTier = research?.confidenceTier ?? "low";
  const giftingHook = research?.giftingHook ?? "";
  const employees = account.employees ?? "100+";
  const template = getOutreachTemplate(options?.outreachTemplate);

  const systemPrompt = `You are ISH's outreach writer. Write personalised, warm, concise corporate gifting emails.
Rules from knowledge base:
${rules}

Few-shot examples:
${FEW_SHOT}

Output ONLY valid JSON with this shape:
{
  "subjectA": "string",
  "subjectB": "string",
  "emailBody": "string (plain text, max 150 words)",
  "outreachGoal": "one sentence",
  "templateVariant": "high_confidence|low_confidence"
}`;

  const userPrompt = `Write an email for:
Company: ${account.name}, ${account.city ?? "India"}, ${account.industry ?? "Corporate"}
Employees: ${employees}
Contact: ${contact.firstName ?? contact.name}, ${contact.title ?? "HR/Admin"}
Confidence tier: ${confidenceTier}
Gifting hook: ${giftingHook || "Diwali season gifting for employees"}
Intel: ${account.intelNotes ?? "none"}

Outreach template: ${template.label}
${template.ctaInstruction}

Rules:
- 3 paragraphs, max 150 words
- Subject A: contains company name
- Subject B: contains contact first name
- Match the CTA to the outreach template above
- Sign off with "ISH Gifting Team"`;

  let emailBody = "";
  let subjectA = "";
  let subjectB = "";
  let outreachGoal = "";
  let templateVariant = "low_confidence";
  let revisionCount = 0;
  let revisionTimeout = false;

  // Deliverability revision loop
  for (let attempt = 0; attempt <= MAX_REVISIONS; attempt++) {
    const raw = await callLLM({
      tier: "fast",
      system: systemPrompt,
      prompt: attempt === 0
        ? userPrompt
        : `${userPrompt}\n\nPrevious draft failed deliverability check. Issues: ${await getDeliverabilityIssues(emailBody)}. Please revise.`,
      maxTokens: 1024,
    });

    let parsed: { subjectA?: string; subjectB?: string; emailBody?: string; outreachGoal?: string; templateVariant?: string } = {};
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      parsed = { subjectA: `Diwali gifts for ${account.name}`, subjectB: `Diwali gifting for your team`, emailBody: raw.slice(0, 800), outreachGoal: "Book a call" };
    }

    emailBody = parsed.emailBody ?? "";
    subjectA = parsed.subjectA ?? `Diwali gifts for ${account.name}`;
    subjectB = parsed.subjectB ?? `Diwali gifting, ${contact.firstName ?? contact.name}`;
    templateVariant = template.id;
    outreachGoal = template.label;

    const delivScore = await scoreDeliverability(emailBody, subjectA);
    revisionCount = attempt;

    if (delivScore >= DELIVERABILITY_PASS_THRESHOLD || attempt === MAX_REVISIONS) {
      if (attempt === MAX_REVISIONS && delivScore < DELIVERABILITY_PASS_THRESHOLD) {
        revisionTimeout = true;
      }

      const rubric = await scoreRubric({ subjectA, emailBody, contact, account });
      const rubricTotal = Object.values(rubric).reduce((s, v) => s + v, 0);

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
          deliverabilityVerdict: delivScore >= 80 ? "PASS" : delivScore >= DELIVERABILITY_PASS_THRESHOLD ? "MARGINAL" : "FAIL",
          rubricScore: rubric as Record<string, number>,
          rubricTotal,
          revisionCount,
          revisionTimeout,
          templateVariant,
          outreachGoal,
          confidenceTier,
        })
        .returning();

      await db.update(leads).set({ status: "draft_ready" }).where(eq(leads.id, leadId));
      await db.insert(yieldFunnel).values({ leadId, stage: "draft_ready", metadata: { rubricTotal, delivScore } });

      return outreach.id;
    }
  }

  throw new Error("Writer revision loop failed");
}

async function scoreDeliverability(body: string, subject: string): Promise<number> {
  let score = 100;
  const spamWords = ["free", "urgent", "guarantee", "100%", "act now", "limited time", "winner", "click here", "buy now"];
  const lower = (body + " " + subject).toLowerCase();

  for (const w of spamWords) {
    if (lower.includes(w)) score -= 10;
  }

  const wordCount = body.trim().split(/\s+/).length;
  if (wordCount > 200) score -= 15;
  if (wordCount < 30) score -= 20;

  if (!body.includes("?")) score -= 5; // no CTA question
  if (!body.toLowerCase().includes("call") && !body.toLowerCase().includes("meet")) score -= 5;
  if (subject.length > 80) score -= 10;
  if (subject.toLowerCase().includes("free") || subject.toLowerCase().includes("offer")) score -= 10;

  return Math.max(0, score);
}

async function getDeliverabilityIssues(body: string): Promise<string> {
  const issues: string[] = [];
  const lower = body.toLowerCase();
  const wordCount = body.trim().split(/\s+/).length;
  if (wordCount > 200) issues.push("too long (>200 words)");
  if (!lower.includes("?")) issues.push("no CTA question");
  if (!lower.includes("call") && !lower.includes("meet")) issues.push("no call-to-action");
  return issues.join("; ") || "generic tone";
}

async function scoreRubric(params: {
  subjectA: string;
  emailBody: string;
  contact: { name: string; title?: string | null; firstName?: string | null };
  account: { name: string; industry?: string | null; city?: string | null; employees?: string | null };
}): Promise<Record<(typeof RUBRIC_DIMENSIONS)[number], number>> {
  const { subjectA, emailBody, contact, account } = params;
  const lower = emailBody.toLowerCase();
  const subjectLower = subjectA.toLowerCase();

  const personalisation =
    (lower.includes(account.name.toLowerCase()) ? 8 : 0) +
    ((contact.firstName && lower.includes(contact.firstName.toLowerCase())) ? 8 : 0) +
    (account.industry && lower.includes(account.industry.toLowerCase()) ? 5 : 0) +
    (account.employees ? 4 : 0);

  const clarity =
    (emailBody.trim().split(/\s+/).length <= 150 ? 15 : 8) +
    (emailBody.split("\n\n").length >= 2 ? 5 : 0) +
    5;

  const cta_strength =
    (lower.includes("schedule") || lower.includes("call") ? 10 : 0) +
    (lower.includes("15") || lower.includes("minutes") ? 8 : 0) +
    (lower.includes("?") ? 7 : 0);

  const deliverability = Math.round(await scoreDeliverability(emailBody, subjectA) / 4);

  return {
    personalisation: Math.min(25, personalisation),
    clarity: Math.min(25, clarity),
    cta_strength: Math.min(25, cta_strength),
    deliverability: Math.min(25, deliverability),
  };
}
