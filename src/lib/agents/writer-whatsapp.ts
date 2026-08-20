import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { callLLM } from "@/lib/llm";
import { parseJsonObjectFromLLM } from "@/lib/llm/parse-json";
import { tierForAgentStep } from "@/lib/llm/routing-policy";
import { db, leadOutreach, leads, contacts, accounts, leadResearch } from "@/db";
import { getResolvedEmailConfig } from "@/lib/settings/email-settings";
import { isWhatsAppConnected } from "@/lib/settings/whatsapp-settings";
import { sanitizePhone } from "@/lib/enrichment/validate-contact";
import { getWriterTonePersona } from "@/lib/agents/writer-tone";
import {
  ensureResearchBriefForWriter,
} from "@/lib/agents/writer-plan";
import {
  buildPersonalizationContext,
  formatPersonalizationContextForPrompt,
} from "@/lib/agents/personalization-context";
import { companyNameForEmail } from "@/lib/email/company-display-name";
import type { CompanyOverview } from "@/lib/company-overview";
import { WhatsAppMobileRequiredError, WhatsAppNotConnectedError, shouldSetDraftReadyFromWhatsApp } from "@/lib/whatsapp/errors";
import {
  WHATSAPP_PROMPT_VERSION,
  WHATSAPP_TEMPLATE_VARIANT,
  sanitizeWhatsAppCopy,
} from "@/lib/whatsapp/outreach";

const whatsappOutputSchema = z.object({
  whatsapp: z.string().min(20),
});

export function parseWhatsAppWriterOutput(raw: string): string | undefined {
  try {
    const obj = parseJsonObjectFromLLM(raw);
    const parsed = whatsappOutputSchema.safeParse(obj);
    if (parsed.success) return sanitizeWhatsAppCopy(parsed.data.whatsapp);
    const wa = typeof obj.whatsapp === "string" ? obj.whatsapp.trim() : "";
    if (wa.length >= 20) return sanitizeWhatsAppCopy(wa);
  } catch {
    const match = /"whatsapp"\s*:\s*"/.exec(raw);
    if (match) {
      let out = "";
      let escaped = false;
      for (let i = match.index + match[0].length; i < raw.length; i++) {
        const ch = raw[i];
        if (escaped) {
          if (ch === "n") out += "\n";
          else if (ch === "t") out += "\t";
          else if (ch === '"') out += '"';
          else out += ch;
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') break;
        out += ch;
      }
      const trimmed = sanitizeWhatsAppCopy(out);
      if (trimmed.length >= 20) return trimmed;
    }
  }
  return undefined;
}

export async function persistWhatsAppDraft(params: {
  leadId: string;
  body: string;
  promptVersion?: string;
  draftSource?: string;
}): Promise<string> {
  const body = sanitizeWhatsAppCopy(params.body);
  const existing = await db.query.leadOutreach.findFirst({
    where: and(eq(leadOutreach.leadId, params.leadId), eq(leadOutreach.templateVariant, WHATSAPP_TEMPLATE_VARIANT)),
    orderBy: [desc(leadOutreach.createdAt)],
  });

  if (existing) {
    await db
      .update(leadOutreach)
      .set({
        whatsapp: body,
        draftSource: params.draftSource ?? existing.draftSource ?? "llm",
        promptVersion: params.promptVersion ?? existing.promptVersion ?? WHATSAPP_PROMPT_VERSION,
        templateVariant: WHATSAPP_TEMPLATE_VARIANT,
        sequencePosition: null,
      })
      .where(eq(leadOutreach.id, existing.id));
    return existing.id;
  }

  const [row] = await db
    .insert(leadOutreach)
    .values({
      leadId: params.leadId,
      promptVersion: params.promptVersion ?? WHATSAPP_PROMPT_VERSION,
      draftSource: params.draftSource ?? "llm",
      whatsapp: body,
      templateVariant: WHATSAPP_TEMPLATE_VARIANT,
      sequencePosition: null,
      emailBody: null,
      emailBodyB: null,
      emailBodyC: null,
      subjectA: null,
      subjectB: null,
      subjectC: null,
    })
    .returning({ id: leadOutreach.id });

  if (!row) throw new Error("Failed to save WhatsApp draft");
  return row.id;
}

function fallbackWhatsAppCopy(params: {
  contactFirstName: string;
  companyDisplayName: string;
  senderFirstName: string;
  brandName: string;
  hook?: string;
  valueProp?: string;
  cta?: string;
}): string {
  const first = params.contactFirstName || "there";
  const hook = params.hook?.trim() || `Corporate gifting for ${params.companyDisplayName}`;
  const value = params.valueProp?.trim() || `${params.brandName} can help your team.`;
  const cta = params.cta?.trim() || "Open to a tasting sample this week?";
  return sanitizeWhatsAppCopy(
    `Hi ${first}, ${hook}. ${value}\n\n${cta}\n\n${params.senderFirstName}\n${params.brandName}`,
  );
}

export async function runWhatsAppWriter(leadId: string): Promise<string> {
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, leadId),
    with: { contact: true, account: true },
  });
  if (!lead) throw new Error(`Lead ${leadId} not found`);

  const connected = await isWhatsAppConnected(lead.workspaceId);
  if (!connected) throw new WhatsAppNotConnectedError();

  const contact = lead.contact as typeof contacts.$inferSelect;
  const account = lead.account as typeof accounts.$inferSelect;
  if (!sanitizePhone(contact.phone)) throw new WhatsAppMobileRequiredError();

  const emailConfig = await getResolvedEmailConfig(lead.workspaceId);
  const { brandConfig, campaignMode, fromName } = emailConfig;
  const senderFirstName = fromName.split(" ")[0] || fromName || "there";
  const contactFirstName = contact.firstName ?? contact.name.split(" ")[0];
  const companyDisplayName = companyNameForEmail(account.name);
  const overview = (account.companyOverview as CompanyOverview | null) ?? null;

  const research = await db.query.leadResearch.findFirst({
    where: eq(leadResearch.leadId, leadId),
  });
  const brief = await ensureResearchBriefForWriter({
    leadId,
    contactName: contact.name,
    contactTitle: contact.title,
    accountName: account.name,
    brandName: brandConfig.brandName,
    existing: research,
  });
  const persona = buildPersonalizationContext({
    industry: account.industry,
    city: account.city,
    accountName: account.name,
    contactTitle: contact.title,
    intelNotes: account.intelNotes,
    overview,
    campaignMode,
    campaignNotes: emailConfig.campaignNotes,
    buyerPersonas: brandConfig.buyerPersonas,
    decisionChain: brief.decisionChain,
    icpSummary: brandConfig.websiteInsights?.icpSummary,
  });

  const tonePersona = getWriterTonePersona(brandConfig);
  const writeup =
    brandConfig.websiteInsights?.productWriteup?.trim() || brandConfig.productSummary || brandConfig.brandName;
  const systemPrompt = `You write short WhatsApp messages for ${brandConfig.brandName} sales outreach.
${tonePersona}

This is a chat, not an email. Output ONLY valid JSON: { "whatsapp": "..." }
Rules:
- 40 to 70 words. One CTA. Conversational.
- Open with Hi ${contactFirstName},
- No subject line, no Thanks & Regards block. Sign off with the sender first name and brand on two lines.
- Never use em dashes. Use commas, periods, or line breaks.
- Never: FREE, urgent, guarantee, act now, complimentary, excited to, just following up, circling back.
- Prefer tasting sample or sample box over complimentary or free.
- Never cite numeric company stats (employee count, headcount, revenue).
- One question only.
- Product truth to use, never announce as "${brandConfig.brandName} offers...": ${writeup}
- Escape newlines in JSON as \\n.`;

  const userPrompt = `Write a WhatsApp first-touch message.

Recipient: ${contactFirstName} (${contact.title ?? "unknown role"}) at ${companyDisplayName}
Sender: ${senderFirstName} (${brandConfig.brandName})
Hook: ${brief.outreachHook}
${formatPersonalizationContextForPrompt(persona)}`;

  let body: string | undefined;
  try {
    const raw = await callLLM({
      tier: tierForAgentStep("writer.write"),
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 600,
      trace: {
        tenantId: lead.tenantId,
        workspaceId: lead.workspaceId,
        agent: "writer",
        leadId,
        promptVersion: WHATSAPP_PROMPT_VERSION,
      },
    });
    body = parseWhatsAppWriterOutput(raw);
  } catch (e) {
    console.error("[writer-whatsapp] LLM failed, using fallback", e);
  }

  if (!body) {
    body = fallbackWhatsAppCopy({
      contactFirstName,
      companyDisplayName,
      senderFirstName,
      brandName: brandConfig.brandName,
      hook: brief.outreachHook,
    });
  }

  const outreachId = await persistWhatsAppDraft({
    leadId,
    body,
    promptVersion: WHATSAPP_PROMPT_VERSION,
    draftSource: "llm",
  });

  if (shouldSetDraftReadyFromWhatsApp(lead.status)) {
    await db.update(leads).set({ status: "draft_ready" }).where(eq(leads.id, leadId));
  }

  return outreachId;
}
