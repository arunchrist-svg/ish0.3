import { callLLM } from "@/lib/llm";
import { tierForAgentStep } from "@/lib/llm/routing-policy";
import { retrieveRelevantRules } from "@/lib/rag";
import { db, leadOutreach, leads, contacts, accounts, leadResearch, yieldFunnel } from "@/db";
import { eq } from "drizzle-orm";
import { isManualStage } from "@/lib/pipeline-status";
import { getOutreachTemplate, type OutreachTemplateId } from "@/lib/email/outreach-templates";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { notifyLeadEvent } from "@/lib/push/notify-workspace";
import { auditContentScored } from "@/lib/email/feedback-hooks";
import {
  scoreSpamMeter,
  deliverabilityVerdict,
  DELIVERABILITY_PASS_THRESHOLD,
  RUBRIC_PASS_THRESHOLD,
  scoreRubric,
  scoreRubricTotal,
  getCombinedRevisionIssues,
} from "@/lib/agents/writer-scoring";
import { fetchRecentSubjectsForWorkspace } from "@/lib/email/recent-subjects";
import { getAntiSpamWritingRules, getRevisionInstruction } from "@/lib/email/content-rules-prompt";
import { normalizeEmailBody, EMAIL_BODY_FORMAT_RULE } from "@/lib/email/email-body-format";
import { getWriterTonePersona, getWriterFewShotExample } from "@/lib/agents/writer-tone";
import { parseWriterOutput } from "@/lib/agents/schemas/writer-output";
import {
  assertResearchReadyForWriter,
  ensureWriterPlan,
  formatWriterPlanForPrompt,
} from "@/lib/agents/writer-plan";

const PROMPT_VERSION = "v2.3-tone-persona";
const MAX_REVISIONS = 2;


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
  const isFollowUp = !!options?.followUpMode;

  if (!isFollowUp) {
    assertResearchReadyForWriter(research);
  }

  const writerPlan = !isFollowUp ? await ensureWriterPlan(leadId) : null;
  const template = getOutreachTemplate(options?.followUpMode ?? options?.outreachTemplate);
  const tonePersona = getWriterTonePersona(brandConfig);
  const fewShot = getWriterFewShotExample(
    brandConfig.brandSlug,
    brandConfig.brandName,
    senderFirstName,
    contactFirstName,
    account.name,
  );

  const sequencePosition = options?.sequencePosition ?? (isFollowUp ? (options?.followUpMode === "follow_up" ? 2 : 3) : 1);
  const antiSpamRules = getAntiSpamWritingRules({
    sequencePosition,
    senderFirstName,
    brandName: brandConfig.brandName,
    emailStyle,
  });

  const toneRules = `
${tonePersona}

- Open with "Hi ${contactFirstName}," (never "Dear")
- Write as ${brandConfig.brandName}: ${brandConfig.productSummary}
- Subject A: short, includes company name; never use em dashes (—) or " - Company" suffix
- Never use em dashes (—) in subject or body
- ${EMAIL_BODY_FORMAT_RULE}
${antiSpamRules}
`;

  const systemPrompt = isFollowUp
    ? `You are ${brandConfig.brandName}'s outreach writer. Write short, friendly but professional follow-up emails. Not salesy.
${options?.followUpMode === "follow_up" ? "Email 2: add NEW value not in Email 1. Never just following up." : "Email 3 (breakup): short, no-pressure, leave the door open."}
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
    : `You are ${brandConfig.brandName}'s outreach writer. Friendly but professional. Not salesy.
Email 1: hook + single soft CTA. No pitch dump.
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
Contact: ${contactFirstName}, ${contact.title ?? "HR/Admin"}
Note: never mention employee count, headcount, revenue, or other numeric company stats in the email
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

${writerPlan ? formatWriterPlanForPrompt(writerPlan) + "\n\n" : ""}

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
      tier: tierForAgentStep("writer.write"),
      system: systemPrompt,
      prompt:
        attempt === 0
          ? userPrompt
          : `${userPrompt}\n\n${getRevisionInstruction(await getCombinedRevisionIssues(emailBody, subjectA, {
              subjectA,
              emailBody,
              contact: { name: contact.name, firstName: contactFirstName, title: contact.title },
              account: { name: account.name, industry: account.industry, city: account.city, employees: account.employees },
              deliverabilityOptions: delivOpts,
              giftingHook,
              intelNotes: account.intelNotes,
            }))}`,
      maxTokens: isFollowUp ? 512 : 1024,
    });

    const { data: parsed, valid: writerJsonValid } = parseWriterOutput(raw);
    if (!writerJsonValid) {
      console.warn("[writer] LLM output failed schema validation for lead", leadId);
    }
    const parsedWithFallback = {
      subjectA: parsed.subjectA ?? `Diwali gifting for ${account.name}`,
      subjectB: parsed.subjectB ?? `Diwali note for ${contactFirstName}`,
      emailBody: parsed.emailBody ?? raw.slice(0, 600),
      outreachGoal: parsed.outreachGoal ?? template.label,
      templateVariant: parsed.templateVariant,
    };

    emailBody = normalizeEmailBody(parsedWithFallback.emailBody ?? "");
    subjectA = parsedWithFallback.subjectA ?? `Diwali gifting for ${account.name}`;
    subjectB = parsedWithFallback.subjectB ?? `Quick question for ${contactFirstName}`;
    templateVariant = options?.followUpMode ?? template.id;
    outreachGoal = parsedWithFallback.outreachGoal ?? template.label;
    revisionCount = attempt;

    const spamResult = scoreSpamMeter(emailBody, subjectA, delivOpts);
    const delivScore = spamResult.inboxScore;

    const rubric = await scoreRubric({
      subjectA,
      emailBody,
      contact: { name: contact.name, firstName: contactFirstName, title: contact.title },
      account: { name: account.name, industry: account.industry, city: account.city, employees: account.employees },
      deliverabilityOptions: delivOpts,
      giftingHook,
      intelNotes: account.intelNotes,
    });
    const rubricTotal = scoreRubricTotal(rubric);
    const passesQuality = delivScore >= DELIVERABILITY_PASS_THRESHOLD && rubricTotal >= RUBRIC_PASS_THRESHOLD;

    if (passesQuality || attempt === maxRevisions) {
      if (attempt === maxRevisions && !passesQuality) {
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
          rubricScore: rubric,
          rubricTotal,
          templateVariant,
          outreachGoal,
          confidenceTier,
          sequencePosition: isFollowUp || options?.sequencePosition ? sequencePosition : 1,
        })
        .returning();

      void auditContentScored({
        tenantId: lead.tenantId,
        workspaceId: lead.workspaceId,
        leadId,
        leadOutreachId: outreach.id,
        contentScore: delivScore,
        ruleHits: spamResult.ruleHits ?? [],
        sequencePosition,
      });

      if (!isFollowUp && !options?.skipStatusUpdate) {
        await db.update(leads).set({ status: "draft_ready" }).where(eq(leads.id, leadId));
        await db
          .insert(yieldFunnel)
          .values({ leadId, stage: "draft_ready", metadata: { delivScore } });
        void notifyLeadEvent(leadId, "draft.ready");
      }

      return outreach.id;
    }
  }

  throw new Error("Writer revision loop failed");
}
