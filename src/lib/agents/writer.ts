import { callLLM, type LLMProvider } from "@/lib/llm";
import { tierForAgentStep } from "@/lib/llm/routing-policy";
import { retrieveRelevantRules } from "@/lib/rag";
import { db, leadOutreach, leads, contacts, accounts, leadResearch, yieldFunnel } from "@/db";
import { eq } from "drizzle-orm";
import { isManualStage } from "@/lib/pipeline-status";
import { getOutreachTemplate, packIdFromBrand, type OutreachTemplateId } from "@/lib/email/outreach-templates";
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
  getDeliverabilityIssues,
} from "@/lib/agents/writer-scoring";
import { fetchRecentSubjectsForWorkspace } from "@/lib/email/recent-subjects";
import { getAntiSpamWritingRules, getRevisionInstruction } from "@/lib/email/content-rules-prompt";
import { normalizeEmailBody, EMAIL_BODY_FORMAT_RULE } from "@/lib/email/email-body-format";
import { getWriterTonePersona, getWriterFewShotExample } from "@/lib/agents/writer-tone";
import { parseWriterOutput } from "@/lib/agents/schemas/writer-output";
import {
  ensureResearchBriefForWriter,
  ensureWriterPlan,
  formatWriterPlanForPrompt,
  getResearchQualityGaps,
} from "@/lib/agents/writer-plan";
import {
  buildPersonalizationContext,
  formatPersonalizationContextForPrompt,
} from "@/lib/agents/personalization-context";
import { getBaselineEmail, TRANSFORMATION_RULES } from "@/lib/email/baseline-templates";
import { fillIshDraftVariants } from "@/lib/email/ish-cold-templates";
import { companyNameForEmail } from "@/lib/email/company-display-name";
import {
  isNearParaphrase,
  BASELINE_PARAPHRASE_THRESHOLD,
  SEQUENCE_CLONE_THRESHOLD,
} from "@/lib/email/email-similarity";
import type { CompanyOverview } from "@/lib/company-overview";

const PROMPT_VERSION = "v2.6-ish-template";
const ISH_TEMPLATE_PROMPT_VERSION = "v2.7-ish-templates";
const MAX_REVISIONS = 2;
const BASELINE_REWRITE_INSTRUCTION =
  "Previous draft paraphrased BASE_TEXT. Rewrite the hook using MACRO, MICRO, and HUMAN context. Keep the three-beat structure (hook, taste-first, one CTA). Do not paste or lightly swap nouns from BASE_TEXT. Never write that the brand offers or specializes in a catalogue.";
const SEQUENCE_REWRITE_INSTRUCTION =
  "Previous draft was too similar to Email 1. Use Email 2 structure: seasonal urgency (Diwali window, tasting slots filling) plus a sampler CTA. Do not reuse Email 1 hook wording. Never say just following up or circling back.";


export type WriterMode = "standard" | "ai";

export type WriterOptions = {
  outreachTemplate?: OutreachTemplateId;
  followUpMode?: "follow_up" | "final_reminder";
  originalEmailBody?: string;
  originalEmailSubject?: string;
  sequencePosition?: number;
  skipStatusUpdate?: boolean;
  forceNewAngle?: boolean;
  writerMode?: WriterMode;
};

export function resolveWriterMode(mode?: string | null): WriterMode {
  return mode === "ai" ? "ai" : "standard";
}

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
  const senderName = fromName.trim() || senderFirstName || "Srilaksha";
  const contactFirstName = contact.firstName ?? contact.name.split(" ")[0];
  const companyDisplayName = companyNameForEmail(account.name);
  const isFollowUp = !!options?.followUpMode;
  const sequencePosition = options?.sequencePosition ?? (isFollowUp ? (options?.followUpMode === "follow_up" ? 2 : 3) : 1);

  const writerMode = resolveWriterMode(options?.writerMode);
  const llmProvider: LLMProvider | undefined = writerMode === "ai" ? "openrouter" : undefined;
  if (writerMode !== "ai" && packIdFromBrand(brandConfig) === "gifting-sweets") {
    return persistIshTemplateDraft({
      lead,
      leadId,
      contact,
      account,
      emailConfig,
      senderFirstName: senderName,
      contactFirstName,
      companyDisplayName,
      sequencePosition,
      templateId: options?.followUpMode ?? options?.outreachTemplate ?? "gift_sampling",
      isFollowUp,
      skipStatusUpdate: options?.skipStatusUpdate,
    });
  }

  let research = await db.query.leadResearch.findFirst({
    where: eq(leadResearch.leadId, leadId),
  });

  const rules = retrieveRelevantRules({
    industry: account.industry ?? undefined,
    city: account.city ?? undefined,
    season: undefined,
    brandSlug: brandConfig.brandSlug,
    verticalPackId: brandConfig.verticalPackId,
    campaignMode,
    productSummary: brandConfig.productSummary,
    campaignNotes: emailConfig.campaignNotes,
    websiteInsights: brandConfig.websiteInsights
      ? {
          valueProposition: brandConfig.websiteInsights.valueProposition,
          differentiators: brandConfig.websiteInsights.differentiators,
          toneNotes: brandConfig.websiteInsights.toneNotes,
          productWriteup: brandConfig.websiteInsights.productWriteup,
          emailKeywords: brandConfig.websiteInsights.emailKeywords,
        }
      : undefined,
  });

  if (!isFollowUp && getResearchQualityGaps(research).length) {
    const filled = await ensureResearchBriefForWriter({
      leadId,
      contactName: contact.name,
      contactTitle: contact.title,
      accountName: account.name,
      brandName: brandConfig.brandName,
      existing: research,
    });
    research =
      (await db.query.leadResearch.findFirst({ where: eq(leadResearch.leadId, leadId) })) ??
      ({
        ...research,
        outreachHook: filled.outreachHook,
        decisionChain: filled.decisionChain,
      } as typeof research);
  }

  const confidenceTier = research?.confidenceTier ?? "low";
  const outreachHook = research?.outreachHook ?? "";

  const writerPlan = !isFollowUp
    ? await ensureWriterPlan(leadId, llmProvider ? { llmProvider } : undefined)
    : null;
  const template = getOutreachTemplate(
    options?.followUpMode ?? options?.outreachTemplate,
    packIdFromBrand(brandConfig),
  );
  const persona = buildPersonalizationContext({
    industry: account.industry,
    city: account.city,
    accountName: account.name,
    contactTitle: contact.title,
    intelNotes: account.intelNotes,
    overview: (account.companyOverview as CompanyOverview | null) ?? null,
    campaignMode,
    campaignNotes: emailConfig.campaignNotes,
    buyerPersonas: brandConfig.buyerPersonas,
    decisionChain: research?.decisionChain,
  });
  const baseline = getBaselineEmail({
    sequencePosition,
    templateId: options?.followUpMode ?? options?.outreachTemplate ?? template.id,
    contactFirstName,
    senderFirstName: senderName,
    brandName: brandConfig.brandName,
    companyName: companyDisplayName,
  });
  const extraHooks = (research?.outreachHooks ?? []).filter(
    (h) => h && h !== outreachHook,
  );
  const tonePersona = getWriterTonePersona(brandConfig);
  const fewShot = getWriterFewShotExample(
    brandConfig.brandSlug,
    brandConfig.brandName,
    senderName,
    contactFirstName,
    companyDisplayName,
    brandConfig.productSummary,
    brandConfig.verticalPackId,
  );

  const antiSpamRules = getAntiSpamWritingRules({
    sequencePosition,
    senderFirstName: senderName,
    brandName: brandConfig.brandName,
    emailStyle,
  });

  const writeup =
    brandConfig.websiteInsights?.productWriteup?.trim() || brandConfig.productSummary;
  const emailKeywords = brandConfig.websiteInsights?.emailKeywords ?? [];
  const keywordRule = emailKeywords.length
    ? `- Use 1-2 of these email themes, never stuff all keywords: ${emailKeywords.join("; ")}`
    : "";

  const toneRules = `
${tonePersona}

- Open with "Hi ${contactFirstName}," (never "Dear")
- Product truth to fold into the thesis, never announce as "${brandConfig.brandName} offers..." or "${brandConfig.brandName} specializes in...": ${writeup}
${keywordRule}
- Subject A: punchy, under 50 characters, include first name OR company (e.g. Send happiness this Diwali, ${contactFirstName}); never use em dashes (—) or " - Company" suffix
- Email 2 and 3 subject A must be exactly Re: plus the Email 1 subject${options?.originalEmailSubject ? ` (${options.originalEmailSubject.replace(/^re:\s*/i, "")})` : ""}
- Never use em dashes (—) in subject or body
- In subject and body, use the short company name only (e.g. "${companyDisplayName}"). Never write Pvt Ltd, Private Limited, India Pvt Ltd, Ltd, LLP, or similar legal suffixes.
- ${EMAIL_BODY_FORMAT_RULE}
${antiSpamRules}
`;

  const jsonShape = isFollowUp
    ? `{
  "subjectA": "string (Re: prefix)",
  "subjectB": "string (Re: prefix, distinct)",
  "subjectC": "string (Re: prefix, distinct)",
  "emailBody": "string (max ${options?.followUpMode === "final_reminder" ? "90" : "80"} words)",
  "emailBodyB": "string (same structure, different urgency angle)",
  "emailBodyC": "string (same structure, different close)",
  "outreachGoal": "one sentence",
  "templateVariant": "${options?.followUpMode}"
}`
    : `{
  "subjectA": "string (e.g. Send happiness this Diwali, {first})",
  "subjectB": "string (e.g. {company}, make someone's Diwali better)",
  "subjectC": "string (e.g. A taste of Diwali, before you decide)",
  "emailBody": "string (max 120 words, 3-beat body option 1)",
  "emailBodyB": "string (max 120 words, 3-beat body option 2, different hook)",
  "emailBodyC": "string (max 120 words, 3-beat body option 3, different hook)",
  "outreachGoal": "one sentence",
  "templateVariant": "high_confidence|low_confidence"
}`;

  const systemPrompt = `You are ${brandConfig.brandName}'s outreach writer and personalization engine. Transform BASE_TEXT into a targeted email for this buyer.
${isFollowUp ? (options?.followUpMode === "follow_up" ? "Email 2: Re: Email 1 subject. Seasonal urgency plus sampler CTA. Never just following up or circling back. Return 3 distinct subjects and 3 distinct bodies." : "Email 3 (breakup): Re: Email 1 subject. Last note, I won't email further, Diwali close. Return 3 distinct subjects and 3 distinct bodies.") : "Email 1: three beats after greeting: persona hook, taste-first, one CTA. Rewrite the hook only. No No worries line. Return 3 distinct subject lines and 3 distinct body options. The user will pick one subject and one body."}
Rules:
${rules}
${toneRules}

${TRANSFORMATION_RULES}

Example:
${fewShot}

Output ONLY valid JSON (no markdown fences). Escape newlines in emailBody as \\n. Never put raw line breaks inside JSON strings.
${jsonShape}`;

  const userPrompt = `${formatPersonalizationContextForPrompt(persona)}

<BASE_TEXT>
${baseline}
</BASE_TEXT>

Company: ${companyDisplayName}, ${account.city ?? "India"}
Contact: ${contactFirstName}, ${contact.title ?? "unknown role"}
Campaign: ${campaignMode}
Confidence tier: ${confidenceTier}
Hook (translate, do not paste): ${outreachHook || "none"}
Intel (translate, do not paste): ${account.intelNotes ?? "none"}
${writerPlan && !isFollowUp ? `\n${formatWriterPlanForPrompt(writerPlan)}\n(Plan is guidance only. BASE_TEXT is the thesis to preserve.)\n` : ""}
Template: ${template.label}
${template.ctaInstruction}
${isFollowUp ? `\nEmail #${options?.followUpMode === "follow_up" ? "2" : "3"} of 3.\nEmail 1 subject: ${options?.originalEmailSubject ?? "unknown"}\nOriginal email (do not repeat hook wording):\n"""\n${options?.originalEmailBody ?? ""}\n"""\n` : ""}
${options?.forceNewAngle ? `\n${SEQUENCE_REWRITE_INSTRUCTION}\n` : ""}
${isFollowUp && extraHooks.length ? `Unused angles for a new value line: ${extraHooks.slice(0, 2).join(" | ")}\n` : ""}
Sign off with Thanks & Regards, then "${senderName}", then ${brandConfig.brandName}
Use company name "${companyDisplayName}" only. Never append India Pvt Ltd, Pvt Ltd, or other legal suffixes.
Return ONLY the rewritten email fields in JSON.`;

  let emailBody = "";
  let emailBodyB = "";
  let emailBodyC = "";
  let subjectA = "";
  let subjectB = "";
  let subjectC = "";
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
    outreachHook,
    recentSubjects,
    baselineBody: baseline,
  };
  const maxRevisions = writerMode === "ai" ? 0 : isFollowUp ? 1 : MAX_REVISIONS;

  for (let attempt = 0; attempt <= maxRevisions; attempt++) {
    let retrySuffix = "";
    if (attempt > 0) {
      const bits: string[] = [];
      if (emailBody && isNearParaphrase(emailBody, baseline, BASELINE_PARAPHRASE_THRESHOLD, "hook")) {
        bits.push(BASELINE_REWRITE_INSTRUCTION);
      }
      if (
        options?.originalEmailBody &&
        emailBody &&
        isNearParaphrase(emailBody, options.originalEmailBody, SEQUENCE_CLONE_THRESHOLD)
      ) {
        bits.push(SEQUENCE_REWRITE_INSTRUCTION);
      }
      bits.push(getRevisionInstruction(await getDeliverabilityIssues(emailBody, subjectA, delivOpts)));
      retrySuffix = `\n\n${bits.join("\n")}`;
    }
    const raw = await callLLM({
      tier: tierForAgentStep("writer.write"),
      system: systemPrompt,
      prompt: `${userPrompt}${retrySuffix}`,
      maxTokens: writerMode === "ai" ? 2048 : isFollowUp ? 2048 : 4096,
      provider: llmProvider,
    });

    const { data: parsed, valid: writerJsonValid } = parseWriterOutput(raw);
    if (!writerJsonValid || !parsed.emailBody) {
      console.warn("[writer] LLM output was not a usable email for lead", leadId);
      if (attempt < maxRevisions) continue;
      throw new Error("Writer returned incomplete JSON instead of an email. Try Write again.");
    }
    const parsedWithFallback = {
      subjectA: parsed.subjectA ?? `Outreach for ${companyDisplayName}`,
      subjectB: parsed.subjectB ?? `Note for ${contactFirstName}`,
      subjectC: parsed.subjectC ?? `A taste of Diwali, ${contactFirstName}`,
      emailBody: parsed.emailBody,
      emailBodyB: parsed.emailBodyB,
      emailBodyC: parsed.emailBodyC,
      outreachGoal: parsed.outreachGoal ?? template.label,
      templateVariant: parsed.templateVariant,
    };

    emailBody = normalizeEmailBody(parsedWithFallback.emailBody ?? "");
    emailBodyB = parsedWithFallback.emailBodyB ? normalizeEmailBody(parsedWithFallback.emailBodyB) : "";
    emailBodyC = parsedWithFallback.emailBodyC ? normalizeEmailBody(parsedWithFallback.emailBodyC) : "";
    subjectA = parsedWithFallback.subjectA ?? `Outreach for ${companyDisplayName}`;
    subjectB = parsedWithFallback.subjectB ?? `Quick question for ${contactFirstName}`;
    subjectC = parsedWithFallback.subjectC ?? `A taste of Diwali, ${contactFirstName}`;
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
      outreachHook,
      intelNotes: account.intelNotes,
      baselineBody: baseline,
    });
    const rubricTotal = scoreRubricTotal(rubric);
    const nearBaseline = isNearParaphrase(emailBody, baseline, BASELINE_PARAPHRASE_THRESHOLD, "hook");
    const nearOriginal = Boolean(
      options?.originalEmailBody &&
        isNearParaphrase(emailBody, options.originalEmailBody, SEQUENCE_CLONE_THRESHOLD),
    );
    const passesQuality =
      delivScore >= DELIVERABILITY_PASS_THRESHOLD &&
      rubricTotal >= RUBRIC_PASS_THRESHOLD &&
      !nearBaseline &&
      !nearOriginal;

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
          subjectC,
          emailBody,
          emailBodyB: emailBodyB || null,
          emailBodyC: emailBodyC || null,
          chosenSubjectKey: "A",
          chosenBodyKey: "A",
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

async function persistIshTemplateDraft(params: {
  lead: { tenantId: string; workspaceId: string };
  leadId: string;
  contact: typeof contacts.$inferSelect;
  account: typeof accounts.$inferSelect;
  emailConfig: Awaited<ReturnType<typeof getResolvedEmailConfig>>;
  senderFirstName: string;
  contactFirstName: string;
  companyDisplayName: string;
  sequencePosition: number;
  templateId: string;
  isFollowUp: boolean;
  skipStatusUpdate?: boolean;
}): Promise<string> {
  const {
    lead,
    leadId,
    contact,
    account,
    emailConfig,
    senderFirstName,
    contactFirstName,
    companyDisplayName,
    sequencePosition,
    templateId,
    isFollowUp,
    skipStatusUpdate,
  } = params;
  const { brandConfig, emailStyle, fromName } = emailConfig;
  const copy = fillIshDraftVariants({
    contactFirstName,
    companyName: companyDisplayName,
    senderFirstName: fromName.trim() || senderFirstName || "Srilaksha",
    brandName: brandConfig.brandName,
    sequencePosition,
    templateId,
  });
  const emailBody = normalizeEmailBody(copy.emailBody);
  const emailBodyB = normalizeEmailBody(copy.emailBodyB);
  const emailBodyC = normalizeEmailBody(copy.emailBodyC);
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
  };
  const spamResult = scoreSpamMeter(emailBody, copy.subjectA, delivOpts);
  const rubric = await scoreRubric({
    subjectA: copy.subjectA,
    emailBody,
    contact: { name: contact.name, firstName: contactFirstName, title: contact.title },
    account: { name: account.name, industry: account.industry, city: account.city, employees: account.employees },
    deliverabilityOptions: delivOpts,
  });
  const delivScore = spamResult.inboxScore;
  const outreachGoal =
    sequencePosition === 2 ? "Follow-up reminder" : sequencePosition === 3 ? "Final reminder" : "Gift sampling";

  const [outreach] = await db
    .insert(leadOutreach)
    .values({
      leadId,
      promptVersion: ISH_TEMPLATE_PROMPT_VERSION,
      draftSource: "template",
      subjectA: copy.subjectA,
      subjectB: copy.subjectB,
      subjectC: copy.subjectC,
      emailBody,
      emailBodyB,
      emailBodyC,
      chosenSubjectKey: "A",
      chosenBodyKey: "A",
      deliverabilityScore: delivScore,
      deliverabilityVerdict: deliverabilityVerdict(delivScore),
      revisionCount: 0,
      revisionTimeout: false,
      rubricScore: rubric,
      rubricTotal: scoreRubricTotal(rubric),
      templateVariant: templateId,
      outreachGoal,
      confidenceTier: "high",
      sequencePosition,
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

  if (!isFollowUp && !skipStatusUpdate) {
    await db.update(leads).set({ status: "draft_ready" }).where(eq(leads.id, leadId));
    await db.insert(yieldFunnel).values({ leadId, stage: "draft_ready", metadata: { delivScore, source: "template" } });
    void notifyLeadEvent(leadId, "draft.ready");
  }

  return outreach.id;
}
