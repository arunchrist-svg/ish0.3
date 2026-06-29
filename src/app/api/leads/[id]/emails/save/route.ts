import { NextResponse } from "next/server";
import { db, leads, contacts, accounts } from "@/db";
import { eq } from "drizzle-orm";
import { requireTenantContext } from "@/lib/tenant";
import { handleApiError } from "@/lib/api-errors";
import { logAudit } from "@/lib/audit";
import {
  generateEmailPermutationsForContact,
  isValidPermutationForContact,
} from "@/lib/enrichment/email-permutations";
import { buildSavedEmailCandidates } from "@/lib/enrichment/email-candidate-queue";
import { formatEnrichmentSourceWithPattern } from "@/lib/enrichment/contact-emails";
import { verifyEmail } from "@/lib/enrichment/verify";
import { requirePipelineWrite } from "@/lib/auth/permissions";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireTenantContext();
    requirePipelineWrite(ctx);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const emails: string[] = Array.isArray(body.emails)
      ? body.emails.filter((e: unknown): e is string => typeof e === "string").map((e: string) => e.trim()).filter(Boolean)
      : [];
    const primaryEmailInput = typeof body.primaryEmail === "string" ? body.primaryEmail.trim() : undefined;

    if (!emails.length) {
      return NextResponse.json({ error: "Select at least one email address." }, { status: 400 });
    }

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

    const uniqueEmails = [...new Set(emails)];
    for (const email of uniqueEmails) {
      if (!isValidPermutationForContact(email, contactInput)) {
        return NextResponse.json({ error: `Invalid email candidate: ${email}` }, { status: 400 });
      }
    }

    const primaryEmail = primaryEmailInput && uniqueEmails.includes(primaryEmailInput)
      ? primaryEmailInput
      : uniqueEmails[0];

    const permutations = generateEmailPermutationsForContact(contactInput);
    if ("error" in permutations) {
      return NextResponse.json({ error: permutations.error }, { status: 400 });
    }

    const patternByEmail = new Map(
      permutations.suggestions.map((s) => [s.email.toLowerCase(), s.pattern]),
    );

    const verified = await verifyEmail(primaryEmail);
    const { primary, alternates } = buildSavedEmailCandidates(uniqueEmails, primaryEmail, patternByEmail);

    await db
      .update(contacts)
      .set({
        email: primary.email,
        emailStatus: verified.status,
        emailConfidence: primary.emailConfidence ?? 30,
        enrichmentProvider: "permutation",
        enrichmentSource: formatEnrichmentSourceWithPattern(primary.pattern ?? "unknown"),
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
        primaryEmail,
        savedCount: uniqueEmails.length,
        patterns: uniqueEmails.map((email) => patternByEmail.get(email.toLowerCase()) ?? "unknown"),
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
