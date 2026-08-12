import { NextResponse } from "next/server";
import { db, leads, contacts, accounts } from "@/db";
import { eq } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { logAudit } from "@/lib/audit";
import {
  generateEmailPermutationsForContact,
} from "@/lib/enrichment/email-permutations";
import { buildManagedEmailCandidates } from "@/lib/enrichment/email-candidate-queue";
import {
  formatEnrichmentSourceWithPattern,
  type ContactEmailEntry,
} from "@/lib/enrichment/contact-emails";
import { emailBelongsToCompany } from "@/lib/enrichment/company-domain-quality";
import { sanitizeEmail } from "@/lib/enrichment/validate-contact";
import { verifyEmail } from "@/lib/enrichment/verify";
import { requirePipelineWrite } from "@/lib/auth/permissions";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const emailsRaw: string[] = Array.isArray(body.emails)
      ? body.emails.filter((e: unknown): e is string => typeof e === "string").map((e: string) => e.trim()).filter(Boolean)
      : [];
    const primaryEmailInput = typeof body.primaryEmail === "string" ? body.primaryEmail.trim() : undefined;
    const allowEmpty = body.allowEmpty === true || body.clear === true;

    const rows = await db
      .select({ lead: leads, contact: contacts, account: accounts })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .innerJoin(accounts, eq(accounts.id, leads.accountId))
      .where(eq(leads.id, id))
      .limit(1);

    if (!rows.length || rows[0].lead.tenantId !== ctx.tenantId) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const { lead, contact, account } = rows[0];
    const contactInput = {
      firstName: contact.firstName,
      lastName: contact.lastName,
      name: contact.name,
      domain: account.domain,
      website: account.website,
      companyName: account.name,
    };

    const uniqueEmails: string[] = [];
    const seen = new Set<string>();
    for (const raw of emailsRaw) {
      const cleaned = sanitizeEmail(raw);
      if (!cleaned) {
        return NextResponse.json({ error: `Invalid email address: ${raw}` }, { status: 400 });
      }
      if (!emailBelongsToCompany(cleaned, account.name)) {
        return NextResponse.json(
          { error: `Email must use this company's domain: ${cleaned}` },
          { status: 400 },
        );
      }
      if (seen.has(cleaned)) continue;
      seen.add(cleaned);
      uniqueEmails.push(cleaned);
    }

    if (!uniqueEmails.length && !allowEmpty) {
      return NextResponse.json({ error: "Add at least one email address." }, { status: 400 });
    }

    const permutations = generateEmailPermutationsForContact(contactInput);
    const patternByEmail = new Map<string, string>();
    if (!("error" in permutations)) {
      for (const suggestion of permutations.suggestions) {
        patternByEmail.set(suggestion.email.toLowerCase(), suggestion.pattern);
      }
    }

    const existing = [
      ...((contact.alternateEmails as ContactEmailEntry[] | null) ?? []),
    ];
    if (contact.email) {
      existing.unshift({
        email: contact.email,
        emailStatus: (contact.emailStatus as ContactEmailEntry["emailStatus"]) ?? "unverified",
        emailConfidence: contact.emailConfidence ?? undefined,
        enrichmentProvider: contact.enrichmentProvider ?? undefined,
        enrichmentSource: contact.enrichmentSource ?? undefined,
      });
    }

    const { primary, alternates } = buildManagedEmailCandidates(uniqueEmails, primaryEmailInput, {
      patternByEmail,
      existing,
    });

    if (!primary) {
      await db
        .update(contacts)
        .set({
          email: null,
          emailStatus: "missing",
          emailConfidence: null,
          enrichmentProvider: null,
          enrichmentSource: null,
          alternateEmails: [],
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, contact.id));

      await logAudit({
        tenantId: ctx.tenantId,
        workspaceId: lead.workspaceId,
        action: "lead.emails_cleared",
        entityType: "lead",
        entityId: id,
        metadata: {},
      });

      return NextResponse.json({
        success: true,
        email: null,
        emailStatus: "missing",
        alternateEmails: [],
      });
    }

    const verified = await verifyEmail(primary.email);
    const enrichmentSource =
      primary.pattern && primary.pattern !== "custom"
        ? formatEnrichmentSourceWithPattern(primary.pattern)
        : primary.enrichmentSource ?? "manual";

    await db
      .update(contacts)
      .set({
        email: primary.email,
        emailStatus: verified.status,
        emailConfidence: primary.emailConfidence ?? 40,
        enrichmentProvider: primary.enrichmentProvider ?? "manual",
        enrichmentSource,
        alternateEmails: alternates,
        updatedAt: new Date(),
      })
      .where(eq(contacts.id, contact.id));

    await logAudit({
      tenantId: ctx.tenantId,
      workspaceId: lead.workspaceId,
      action: "lead.emails_saved",
      entityType: "lead",
      entityId: id,
      metadata: {
        primaryEmail: primary.email,
        savedCount: uniqueEmails.length,
        patterns: uniqueEmails.map((email) => patternByEmail.get(email.toLowerCase()) ?? "custom"),
      },
    });

    return NextResponse.json({
      success: true,
      email: primary.email,
      emailStatus: verified.status,
      alternateEmails: alternates,
    });
  } catch (e) {
    return handleApiError(e, "[leads/emails/save]");
  }
}
