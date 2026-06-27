import { callLLM } from "@/lib/llm";
import { retrieveRelevantRules } from "@/lib/rag";
import { db, leadOutreach, leads, contacts, accounts, leadResearch, yieldFunnel } from "@/db";
import { eq } from "drizzle-orm";
import { isManualStage } from "@/lib/pipeline-status";
import { getOutreachTemplate, type OutreachTemplateId } from "@/lib/email/outreach-templates";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import {
  scoreSpamMeter,
  getDeliverabilityIssues,
  deliverabilityVerdict,
  DELIVERABILITY_PASS_THRESHOLD,
} from "@/lib/agents/writer-scoring";
import { fetchRecentSubjectsForWorkspace } from "@/lib/email/recent-subjects";
import { getAntiSpamWritingRules, getRevisionInstruction } from "@/lib/email/content-rules-prompt";

const PROMPT_VERSION = "v2.1-anti-spam";
const MAX_REVISIONS = 2;

function buildFewShot(brandName: string, senderFirstName: string) {
  return `
---
GOOD EXAMPLE (follow this pattern):
Subject A: Diwali hampers for TechCorp in Bangalore
Subject B: Quick note for Priya at TechCorp
Body:
Hi Priya,

I noticed TechCorp has been growing its Bangalore tech campus. With Diwali a few weeks out, we have been curating mithai and dry-fruit hampers for IT teams in the city.

Would a 15-minute call this week work to share a few options? No worries if the timing is off.

${senderFirstName}
Partnerships, ${brandName}

---
`;
}

export type WriterOptions = {
  outreachTemplate?: OutreachTemplateId;
  followUpMode?: "follow_up" | "final_reminder";
  originalEmailBody?: string;
  sequencePosition?: number;
  skipStatusUpdate?: boolean;
};

export async function runWriter(leadId: string, options?: WriterOptions): Promise<string> {
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, leadId),
    with: { contact: true, account: true },
  });

  if (!lead) throw new Error(`Lead ${leadId} not found`);

  if (isManualStage(lead.status) && !options?.followUpMode) {
    throw new Error(`Cannot generate draft for lead in ${lead.status} stage`);
  }

  const contact = lead.contact as typeof contacts.$inferSelect;
  const account = lead.account as typeof accounts.$inferSelect;
  const emailConfig = await getResolvedEmailConfig(lead.workspaceId);
  const { brandConfig, campaignMode, emailStyle, fromName } = emailConfig;
  const senderFirstName = fromName.split(" ")[0] || fromName;
  const contactFirstName = contact.firstName ?? contact.name.split(" ")[0];

  const research = await db.query.leadResearch.findFirst({
    where: eq(leadResearch.leadId, leadId),
  });

  const rules = retrieveRelevantRules({
    industry: account.industry ?? undefined,
    city: account.city ?? undefined,
    season: "diwali",
    brandSlug: brandConfig.brandSlug,
    campaignMode,
    productSummary: brandConfig.productSummary,
    campaignNotes: emailConfig.campaignNotes,
  });

  const confidenceTier = research?.confidenceTier ?? "low";
  const giftingHook = research?.giftingHook ?? "";
  const employees = account.employees ?? "100+";
  const isFollowUp = !!options?.followUpMode;
  const template = getOutreachTemplate(options?.followUpMode ?? options?.outreachTemplate);
  const fewShot = buildFewShot(brandConfig.brandName, senderFirstName);

  const sequencePosition = options?.sequencePosition ?? (isFollowUp ? (options?.followUpMode === "follow_up" ? 2 : 3) : 1);
  const hasVerifiedEmployeeCount = Boolean(account.employees?.trim() && account.employees !== "100+");
  const antiSpamRules = getAntiSpamWritingRules({
    sequencePosition,
    senderFirstName,
    brandName: brandConfig.brandName,
    emailStyle,
    hasVerifiedEmployeeCount,
  });

  const toneRules = `
- Open with "Hi ${contactFirstName}," (never "Dear")
- Write as ${brandConfig.brandName}: ${brandConfig.productSummary}
- Subject A: short, includes company name; never use em dashes (—) or " - Company" suffix
- Never use em dashes (—) in subject or body
${antiSpamRules}
`;

  const systemPrompt = isFollowUp
    ? `You are ${brandConfig.brandName}'s outreach writer. Write short, warm, personalised follow-up emails.
Rules:
${rules}
${toneRules}

Output ONLY valid JSON:
{
  "subjectA": "string (Re: prefix)",
  "subjectB": "string",
  "emailBody": "string (max ${options?.followUpMode === "final_reminder" ? "70" : "80"} words)",
  "outreachGoal": "one sentence",
  "templateVariant": "${options?.followUpMode}"
}`
    : `You are ${brandConfig.brandName}'s outreach writer.
Rules:
${rules}
${toneRules}

Example:
${fewShot}

Output ONLY valid JSON:
{
  "subjectA": "string",
  "subjectB": "string",
  "emailBody": "string (max 120 words)",
  "outreachGoal": "one sentence",
  "templateVariant": "high_confidence|low_confidence"
}`;

  const baseUserPrompt = `Company: ${account.name}, ${account.city ?? "India"}, ${account.industry ?? "Corporate"}
Employees (use only if listed, never invent): ${hasVerifiedEmployeeCount ? employees : "not verified; do not cite numbers"}
Contact: ${contactFirstName}, ${contact.title ?? "HR/Admin"}
Brand: ${brandConfig.brandName} (${brandConfig.vertical})
Campaign: ${campaignMode}
Confidence tier: ${confidenceTier}
Hook: ${giftingHook || brandConfig.productSummary}
Intel: ${account.intelNotes ?? "none"}`;

  const userPrompt = isFollowUp
    ? `${baseUserPrompt}

Email #${options?.followUpMode === "follow_up" ? "2" : "3"} of 3.

Original email:
"""
${options?.originalEmailBody ?? ""}
"""

${template.ctaInstruction}
Sign off with "${senderFirstName}"`
    : `Write an email for:
${baseUserPrompt}

Template: ${template.label}
${template.ctaInstruction}

Sign off with "${senderFirstName}"`;

  let emailBody = "";
  let subjectA = "";
  let subjectB = "";
  let templateVariant = "low_confidence";
  let outreachGoal = "";
  let revisionCount = 0;
  let revisionTimeout = false;

  const recentSubjects = await fetchRecentSubjectsForWorkspace(lead.workspaceId);
  const delivOpts = {
    emailStyle,
    fromName,
    contactFirstName,
    sequencePosition,
    account: {
      name: account.name,
      employees: account.employees,
      industry: account.industry,
      city: account.city,
      enrichmentSource: contact.enrichmentSource,
    },
    contact: { firstName: contactFirstName, title: contact.title },
    giftingHook,
    recentSubjects,
  };
  const maxRevisions = isFollowUp ? 1 : MAX_REVISIONS;

  for (let attempt = 0; attempt <= maxRevisions; attempt++) {
    const raw = await callLLM({
      tier: "fast",
      system: systemPrompt,
      prompt:
        attempt === 0
          ? userPrompt
          : `${userPrompt}\n\n${getRevisionInstruction(await getDeliverabilityIssues(emailBody, subjectA, delivOpts))}`,
      maxTokens: isFollowUp ? 512 : 1024,
    });

    let parsed: {
      subjectA?: string;
      subjectB?: string;
      emailBody?: string;
      outreachGoal?: string;
      templateVariant?: string;
    } = {};
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      parsed = {
        subjectA: `Diwali gifting for ${account.name}`,
        subjectB: `Quick question for ${contactFirstName}`,
        emailBody: raw.slice(0, 600),
        outreachGoal: template.label,
      };
    }

    emailBody = parsed.emailBody ?? "";
    subjectA = parsed.subjectA ?? `Diwali gifting for ${account.name}`;
    subjectB = parsed.subjectB ?? `Quick question for ${contactFirstName}`;
    templateVariant = options?.followUpMode ?? template.id;
    outreachGoal = parsed.outreachGoal ?? template.label;
    revisionCount = attempt;

    const spamResult = scoreSpamMeter(emailBody, subjectA, delivOpts);
    const delivScore = spamResult.inboxScore;

    if (delivScore >= DELIVERABILITY_PASS_THRESHOLD || attempt === maxRevisions) {
      if (attempt === maxRevisions && delivScore < DELIVERABILITY_PASS_THRESHOLD) {
        revisionTimeout = true;
      }

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
          revisionCount,
          revisionTimeout,
          templateVariant,
          outreachGoal,
          confidenceTier,
          sequencePosition: isFollowUp || options?.sequencePosition ? sequencePosition : 1,
        })
        .returning();

      if (!isFollowUp && !options?.skipStatusUpdate) {
        await db.update(leads).set({ status: "draft_ready" }).where(eq(leads.id, leadId));
        await db
          .insert(yieldFunnel)
          .values({ leadId, stage: "draft_ready", metadata: { delivScore } });
      }

      return outreach.id;
    }
  }

  throw new Error("Writer revision loop failed");
}
