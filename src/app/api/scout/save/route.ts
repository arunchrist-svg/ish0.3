import { NextResponse } from "next/server";
import { db, accounts, contacts, leads, yieldFunnel, enrichmentRuns } from "@/db";
import { verifyEmail } from "@/lib/enrichment/verify";
import { logAudit } from "@/lib/audit";
import { callLLM } from "@/lib/llm";
import type { ScoutPersonResult, ScoutCompanyResult } from "@/lib/enrichment/types";

const DEFAULT_TENANT = "00000000-0000-0000-0000-000000000001";
const DEFAULT_WORKSPACE = "00000000-0000-0000-0000-000000000002";
const DEFAULT_CAMPAIGN = "00000000-0000-0000-0000-000000000003";

async function preFilterCheck(person: ScoutPersonResult, company: ScoutCompanyResult): Promise<{pass: boolean; reason: string}> {
  try {
    const raw = await callLLM({
      tier: "fast",
      system: `You are a B2B lead relevance classifier for a corporate gifting company (India Sweet House).
Output ONLY valid JSON: { "pass": boolean, "reason": string }
Pass = true if the company is a real, current Indian company that buys corporate gifts for employees (100+ employees, active business).
Pass = false if: foreign company, very small (<50 employees), irrelevant industry, or clearly hallucinated.`,
      prompt: `Company: ${company.name}, City: ${company.city ?? "India"}, Industry: ${company.industry ?? "unknown"}, Employees: ${company.employees ?? "unknown"}
Person: ${person.name}, Title: ${person.title ?? "unknown"}
Is this a valid corporate gifting target?`,
      maxTokens: 128,
    });
    const parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    return { pass: !!parsed.pass, reason: parsed.reason ?? "" };
  } catch {
    return { pass: true, reason: "pre-filter skipped (llm error)" };
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { people, company }: { people: ScoutPersonResult[]; company: ScoutCompanyResult } = body;

    if (!people?.length || !company?.name) {
      return NextResponse.json({ error: "people and company required" }, { status: 400 });
    }

    // Upsert account
    let resolvedAccountId: string;
    const [account] = await db
      .insert(accounts)
      .values({
        tenantId: DEFAULT_TENANT,
        workspaceId: DEFAULT_WORKSPACE,
        name: company.name,
        domain: company.domain,
        website: company.website,
        industry: company.industry,
        city: company.city,
        employees: company.employees,
        logo: company.logo,
        giftScore: company.giftScore,
        giftBudget: company.giftBudget,
        intelNotes: company.intelNotes,
        dataSource: company.dataSource,
        externalId: company.externalId,
      })
      .onConflictDoNothing()
      .returning();

    if (account) {
      resolvedAccountId = account.id;
    } else {
      const existing = await db.query.accounts.findFirst({
        where: (a, { eq }) => eq(a.name, company.name),
      });
      if (!existing) return NextResponse.json({ error: "Account save failed" }, { status: 500 });
      resolvedAccountId = existing.id;
    }

    const savedLeads: { leadId: string; name: string; emailStatus: string }[] = [];
    const skipped: { name: string; reason: string }[] = [];

    for (const person of people) {
      const emailResult = await verifyEmail(person.email ?? "");

      await db.insert(enrichmentRuns).values({
        provider: person.dataSource,
        dataMode: (process.env.DEFAULT_DATA_MODE ?? "free") as "free" | "paid" | "auto",
        success: true,
        emailFound: !!person.email,
        emailVerified: emailResult.status === "verified",
        result: { email: person.email, emailStatus: emailResult.status },
      });

      if (emailResult.status === "missing") {
        skipped.push({ name: person.name, reason: "no email found" });
        continue;
      }

      const filter = await preFilterCheck(person, company);
      if (!filter.pass) {
        skipped.push({ name: person.name, reason: `pre-filter rejected: ${filter.reason}` });
        continue;
      }

      const [contact] = await db
        .insert(contacts)
        .values({
          tenantId: DEFAULT_TENANT,
          workspaceId: DEFAULT_WORKSPACE,
          accountId: resolvedAccountId,
          name: person.name,
          firstName: person.firstName,
          lastName: person.lastName,
          title: person.title,
          department: person.department,
          seniority: person.seniority,
          email: person.email,
          emailStatus: emailResult.status,
          phone: person.phone,
          linkedIn: person.linkedIn,
          bio: person.bio,
          isKeyDM: person.isKeyDM ?? false,
          matchScore: person.matchScore,
          engagementSignals: person.engagementSignals ?? [],
          dataSource: person.dataSource,
          externalId: person.externalId,
        })
        .onConflictDoNothing()
        .returning();

      if (!contact) {
        skipped.push({ name: person.name, reason: "contact already exists" });
        continue;
      }

      const [lead] = await db
        .insert(leads)
        .values({
          tenantId: DEFAULT_TENANT,
          workspaceId: DEFAULT_WORKSPACE,
          contactId: contact.id,
          accountId: resolvedAccountId,
          campaignId: DEFAULT_CAMPAIGN,
          status: "scouted",
          score: person.matchScore,
          leadSource: person.dataSource,
          researcherEligible: filter.pass,
          tags: ["Lead", "Gifting Signal"],
        })
        .returning();

      if (!lead) continue;

      await db.insert(yieldFunnel).values({ leadId: lead.id, stage: "scouted" });
      await db.insert(yieldFunnel).values({
        leadId: lead.id,
        stage: "prefiltered",
        metadata: { reason: filter.reason },
      });

      await logAudit({
        tenantId: DEFAULT_TENANT,
        workspaceId: DEFAULT_WORKSPACE,
        action: "lead.saved",
        entityType: "lead",
        entityId: lead.id,
        metadata: { contactName: person.name, company: company.name, emailStatus: emailResult.status },
      });

      savedLeads.push({ leadId: lead.id, name: person.name, emailStatus: emailResult.status });
    }

    return NextResponse.json({ saved: savedLeads, skipped });
  } catch (e) {
    console.error("[api/scout/save]", e);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
