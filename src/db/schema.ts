import {
  pgTable, text, integer, timestamp, boolean, jsonb, serial, uuid, pgEnum, uniqueIndex,
} from "drizzle-orm/pg-core";
import type { CompanyOverview } from "@/lib/company-overview";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const dataMode = pgEnum("data_mode", ["free", "paid", "auto"]);
export const emailStatus = pgEnum("email_status", ["verified", "unverified", "missing", "generic"]);
export const funnelStage = pgEnum("funnel_stage", [
  "scouted", "prefiltered", "researched", "draft_ready",
  "approved", "outreached", "replied", "meeting", "po_closed",
]);
export const sendMode = pgEnum("send_mode", ["dry_run", "test", "live"]);
export const approvalStatus = pgEnum("approval_status", ["pending", "approved", "rejected"]);

// ─── Tenants & Workspaces (SaaS scaffold) ─────────────────────────────────────
export const tenants = pgTable("tenants", {
  id:                uuid("id").defaultRandom().primaryKey(),
  name:              text("name").notNull(),
  slug:              text("slug").notNull().unique(),
  plan:              text("plan").notNull().default("starter"),
  onboardingStatus:  text("onboarding_status").notNull().default("pending"),
  onboardingStep:    integer("onboarding_step").notNull().default(1),
  stripeCustomerId:  text("stripe_customer_id"),
  demoMode:          boolean("demo_mode").notNull().default(true),
  createdAt:         timestamp("created_at").defaultNow().notNull(),
});

export const workspaces = pgTable("workspaces", {
  id:        uuid("id").defaultRandom().primaryKey(),
  tenantId:  uuid("tenant_id").notNull().references(() => tenants.id),
  name:      text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const workspaceSettings = pgTable("workspace_settings", {
  workspaceId:      uuid("workspace_id").primaryKey().references(() => workspaces.id),
  enrichmentConfig: jsonb("enrichment_config").notNull().default({}),
  emailConfig:      jsonb("email_config").notNull().default({}),
  updatedAt:        timestamp("updated_at").defaultNow().notNull(),
});


// ─── SaaS Auth & Billing ──────────────────────────────────────────────────────
export const users = pgTable("users", {
  id:           uuid("id").defaultRandom().primaryKey(),
  email:        text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  googleId:     text("google_id").unique(),
  platformRole: text("platform_role").notNull().default("user"),
  name:                 text("name").notNull(),
  mustChangePassword:   boolean("must_change_password").notNull().default(false),
  createdAt:            timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  id:        uuid("id").defaultRandom().primaryKey(),
  token:     text("token").notNull().unique(),
  userId:    uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId:  uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orgMembers = pgTable("org_members", {
  id:        uuid("id").defaultRandom().primaryKey(),
  userId:    uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId:  uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  role:      text("role").notNull().default("owner"),
  status:    text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  userTenantIdx: uniqueIndex("org_members_user_tenant_idx").on(table.userId, table.tenantId),
}));


export const orgInvites = pgTable("org_invites", {
  id:         uuid("id").defaultRandom().primaryKey(),
  tenantId:   uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  email:      text("email").notNull(),
  role:       text("role").notNull().default("member"),
  token:      text("token").notNull().unique(),
  invitedBy:  uuid("invited_by").notNull().references(() => users.id),
  invitedBySuperadmin: boolean("invited_by_superadmin").notNull().default(false),
  expiresAt:  timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
});

export const plans = pgTable("plans", {
  id:              uuid("id").defaultRandom().primaryKey(),
  slug:            text("slug").notNull().unique(),
  name:            text("name").notNull(),
  priceCents:      integer("price_cents").notNull(),
  includedCredits: integer("included_credits").notNull(),
  seatLimit:       integer("seat_limit").notNull().default(2),
  features:        jsonb("features").notNull().default({}),
  stripePriceId:   text("stripe_price_id"),
  createdAt:       timestamp("created_at").defaultNow().notNull(),
});

export const subscriptions = pgTable("subscriptions", {
  id:                   uuid("id").defaultRandom().primaryKey(),
  tenantId:             uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }).unique(),
  planId:               uuid("plan_id").notNull().references(() => plans.id),
  stripeSubscriptionId: text("stripe_subscription_id"),
  status:               text("status").notNull().default("trialing"),
  currentPeriodStart:   timestamp("current_period_start"),
  currentPeriodEnd:     timestamp("current_period_end"),
  createdAt:            timestamp("created_at").defaultNow().notNull(),
});

export const creditBalances = pgTable("credit_balances", {
  tenantId:    uuid("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  balance:     integer("balance").notNull().default(0),
  periodStart: timestamp("period_start"),
  periodEnd:   timestamp("period_end"),
  updatedAt:   timestamp("updated_at").defaultNow().notNull(),
});

export const creditTransactions = pgTable("credit_transactions", {
  id:             uuid("id").defaultRandom().primaryKey(),
  tenantId:       uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  amount:         integer("amount").notNull(),
  action:         text("action").notNull(),
  referenceId:    text("reference_id"),
  idempotencyKey: text("idempotency_key").unique(),
  metadata:       jsonb("metadata").default({}),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
});


export const usageEvents = pgTable("usage_events", {
  id:             uuid("id").defaultRandom().primaryKey(),
  tenantId:       uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  action:         text("action").notNull(),
  quantity:       integer("quantity").notNull().default(1),
  creditsCharged: integer("credits_charged").notNull().default(0),
  metadata:       jsonb("metadata").default({}),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
});

export const conversionEvents = pgTable("conversion_events", {
  id:        uuid("id").defaultRandom().primaryKey(),
  tenantId:  uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  userId:    uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  event:     text("event").notNull(),
  metadata:  jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Campaigns ────────────────────────────────────────────────────────────────
export const campaigns = pgTable("campaigns", {
  id:             uuid("id").defaultRandom().primaryKey(),
  tenantId:       uuid("tenant_id").notNull().references(() => tenants.id),
  workspaceId:    uuid("workspace_id").notNull().references(() => workspaces.id),
  name:           text("name").notNull(),
  season:         text("season").notNull(),
  startDate:      timestamp("start_date"),
  endDate:        timestamp("end_date"),
  giftingContext: text("gifting_context"),
  targetCities:   jsonb("target_cities").$type<string[]>().default([]),
  targetIndustries: jsonb("target_industries").$type<string[]>().default([]),
  cadenceDays:    jsonb("cadence_days").$type<number[]>().default([4, 8, 14]),
  isActive:       boolean("is_active").notNull().default(true),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
});

// ─── Accounts (Companies) ─────────────────────────────────────────────────────
export const accounts = pgTable("accounts", {
  id:           uuid("id").defaultRandom().primaryKey(),
  tenantId:     uuid("tenant_id").notNull().references(() => tenants.id),
  workspaceId:  uuid("workspace_id").notNull().references(() => workspaces.id),
  name:         text("name").notNull(),
  domain:       text("domain"),
  website:      text("website"),
  industry:     text("industry"),
  city:         text("city"),
  employees:    text("employees"),
  revenue:      text("revenue"),
  logo:         text("logo"),
  giftScore:    integer("gift_score"),
  giftBudget:   text("gift_budget"),
  pastGifting:  jsonb("past_gifting").$type<object[]>().default([]),
  intelNotes:   text("intel_notes"),
  companyOverview: jsonb("company_overview").$type<CompanyOverview | null>(),
  overviewEnrichedAt: timestamp("overview_enriched_at"),
  dataSource:   text("data_source"),
  externalId:   text("external_id"),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
  updatedAt:    timestamp("updated_at").defaultNow().notNull(),
  isPinned:     boolean("is_pinned").default(false),
});

// ─── Contacts (People) ────────────────────────────────────────────────────────
export const contacts = pgTable("contacts", {
  id:              uuid("id").defaultRandom().primaryKey(),
  tenantId:        uuid("tenant_id").notNull().references(() => tenants.id),
  workspaceId:     uuid("workspace_id").notNull().references(() => workspaces.id),
  accountId:       uuid("account_id").notNull().references(() => accounts.id),
  name:            text("name").notNull(),
  firstName:       text("first_name"),
  lastName:        text("last_name"),
  title:           text("title"),
  department:      text("department"),
  seniority:       text("seniority"),
  email:           text("email"),
  emailStatus:     emailStatus("email_status").default("missing"),
  emailVerifiedAt: timestamp("email_verified_at"),
  emailConfidence: integer("email_confidence"),
  enrichmentSource: text("enrichment_source"),
  enrichmentProvider: text("enrichment_provider"),
  alternateEmails: jsonb("alternate_emails").$type<import("@/lib/enrichment/contact-emails").ContactEmailEntry[]>().default([]),
  phone:           text("phone"),
  linkedIn:        text("linkedin"),
  bio:             text("bio"),
  isKeyDM:         boolean("is_key_dm").default(false),
  matchScore:      integer("match_score"),
  engagementSignals: jsonb("engagement_signals").$type<string[]>().default([]),
  dataSource:      text("data_source"),
  externalId:      text("external_id"),
  createdAt:       timestamp("created_at").defaultNow().notNull(),
  updatedAt:       timestamp("updated_at").defaultNow().notNull(),
});

// ─── Leads ────────────────────────────────────────────────────────────────────
export const leads = pgTable("leads", {
  id:           uuid("id").defaultRandom().primaryKey(),
  tenantId:     uuid("tenant_id").notNull().references(() => tenants.id),
  workspaceId:  uuid("workspace_id").notNull().references(() => workspaces.id),
  contactId:    uuid("contact_id").notNull().references(() => contacts.id),
  accountId:    uuid("account_id").notNull().references(() => accounts.id),
  campaignId:   uuid("campaign_id").references(() => campaigns.id),
  status:       text("status").notNull().default("scouted"),
  score:        integer("score"),
  scoreGrade:   text("score_grade"),
  scoreTrend:   text("score_trend"),
  estimatedValue: text("estimated_value"),
  closedDealAmount: text("closed_deal_amount"),
  leadSource:   text("lead_source").default("scout"),
  rating:       text("rating").default("Warm"),
  owner:        text("owner").default("ISH Cluster Mgr"),
  tags:         jsonb("tags").$type<string[]>().default([]),
  researcherEligible: boolean("researcher_eligible").notNull().default(false),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
  lastReplyContent: text("last_reply_content"),
  lastInboundMessageId: text("last_inbound_message_id"),
  threadRootMessageId: text("thread_root_message_id"),
  threadRootSubject: text("thread_root_subject"),
  updatedAt:    timestamp("updated_at").defaultNow().notNull(),
  isPinned:     boolean("is_pinned").default(false),
});

// ─── Lead Research ────────────────────────────────────────────────────────────
export const leadResearch = pgTable("lead_research", {
  id:              uuid("id").defaultRandom().primaryKey(),
  leadId:          uuid("lead_id").notNull().references(() => leads.id),
  confidenceTier:  text("confidence_tier").notNull().default("low"),
  confidenceScore: integer("confidence_score"),
  giftingHook:     text("gifting_hook"),
  estimatedOrderValue: text("estimated_order_value"),
  decisionChain:   jsonb("decision_chain").$type<string[]>().default([]),
  outreachHooks:   jsonb("outreach_hooks").$type<string[]>().default([]),
  scoreFactors:    jsonb("score_factors").$type<{label: string; bold: string}[]>().default([]),
  rawBrief:        text("raw_brief"),
  createdAt:       timestamp("created_at").defaultNow().notNull(),
});

// ─── Lead Outreach (Writer output) ───────────────────────────────────────────
export const leadOutreach = pgTable("lead_outreach", {
  id:                uuid("id").defaultRandom().primaryKey(),
  leadId:            uuid("lead_id").notNull().references(() => leads.id),
  campaignId:        uuid("campaign_id").references(() => campaigns.id),
  promptVersion:     text("prompt_version"),
  draftSource:       text("draft_source").notNull().default("llm"),
  subjectA:          text("subject_a"),
  subjectB:          text("subject_b"),
  emailBody:         text("email_body"),
  whatsapp:          text("whatsapp"),
  linkedinNote:      text("linkedin_note"),
  callScript:        text("call_script"),
  deliverabilityScore: integer("deliverability_score"),
  deliverabilityVerdict: text("deliverability_verdict"),
  rubricScore:       jsonb("rubric_score").$type<Record<string, number>>(),
  rubricTotal:       integer("rubric_total"),
  revisionCount:     integer("revision_count").default(0),
  revisionTimeout:   boolean("revision_timeout").default(false),
  templateVariant:   text("template_variant"),
  outreachGoal:      text("outreach_goal"),
  confidenceTier:    text("confidence_tier"),
  sequencePosition:  integer("sequence_position"),
  createdAt:         timestamp("created_at").defaultNow().notNull(),
});

// ─── Outreach Edit Messages (chat history) ───────────────────────────────────
export const outreachEditMessages = pgTable("outreach_edit_messages", {
  id:             uuid("id").defaultRandom().primaryKey(),
  leadOutreachId: uuid("lead_outreach_id").notNull().references(() => leadOutreach.id, { onDelete: "cascade" }),
  role:           text("role").notNull(),
  content:        text("content").notNull(),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
});

// ─── Outreach Approvals ───────────────────────────────────────────────────────
export const outreachApprovals = pgTable("outreach_approvals", {
  id:            uuid("id").defaultRandom().primaryKey(),
  leadOutreachId: uuid("lead_outreach_id").notNull().references(() => leadOutreach.id, { onDelete: "cascade" }),
  leadId:        uuid("lead_id").notNull().references(() => leads.id),
  channel:       text("channel").notNull(),
  status:        approvalStatus("status").notNull().default("pending"),
  subjectUsed:   text("subject_used"),
  rejectReason:  text("reject_reason"),
  rejectNote:    text("reject_note"),
  actorId:       text("actor_id").default("cm"),
  reviewedAt:    timestamp("reviewed_at"),
  createdAt:     timestamp("created_at").defaultNow().notNull(),
});

// ─── Outreach Schedule (Sequencer) ───────────────────────────────────────────
// status values: "scheduled" | "sent" | "cancelled"
export const outreachSchedule = pgTable("outreach_schedule", {
  id:            uuid("id").defaultRandom().primaryKey(),
  leadId:        uuid("lead_id").notNull().references(() => leads.id),
  approvalId:    uuid("approval_id").references(() => outreachApprovals.id, { onDelete: "set null" }),
  channel:       text("channel").notNull(),
  sequenceDay:   integer("sequence_day").notNull(),
  scheduledFor:  timestamp("scheduled_for").notNull(),
  sentAt:        timestamp("sent_at"),
  openedAt:      timestamp("opened_at"),
  status:        text("status").notNull().default("scheduled"),
  sendMode:      sendMode("send_mode").default("dry_run"),
  resendId:      text("resend_id"),
  rfcMessageId:  text("rfc_message_id"),
  inReplyTo:     text("in_reply_to"),
  referencesChain: text("references_chain"),
  emailKind:     text("email_kind"),
  subjectSent:   text("subject_sent"),
  bodySnippet:   text("body_snippet"),
  draftLeadOutreachId: uuid("draft_lead_outreach_id").references(() => leadOutreach.id, { onDelete: "set null" }),
  trackingToken: text("tracking_token"),
  createdAt:     timestamp("created_at").defaultNow().notNull(),
});

// ─── Yield Funnel ─────────────────────────────────────────────────────────────
export const yieldFunnel = pgTable("yield_funnel", {
  id:        uuid("id").defaultRandom().primaryKey(),
  leadId:    uuid("lead_id").notNull().references(() => leads.id),
  stage:     funnelStage("stage").notNull(),
  enteredAt: timestamp("entered_at").defaultNow().notNull(),
  metadata:  jsonb("metadata").$type<Record<string, unknown>>(),
});

// ─── Enrichment Runs ─────────────────────────────────────────────────────────
export const enrichmentRuns = pgTable("enrichment_runs", {
  id:          uuid("id").defaultRandom().primaryKey(),
  contactId:   uuid("contact_id").references(() => contacts.id),
  leadId:      uuid("lead_id").references(() => leads.id),
  provider:    text("provider").notNull(),
  dataMode:    dataMode("data_mode").notNull(),
  success:     boolean("success").notNull(),
  emailFound:  boolean("email_found").default(false),
  emailVerified: boolean("email_verified").default(false),
  result:      jsonb("result").$type<Record<string, unknown>>(),
  errorMsg:    text("error_msg"),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});

// ─── Audit Events ─────────────────────────────────────────────────────────────
export const auditEvents = pgTable("audit_events", {
  id:          uuid("id").defaultRandom().primaryKey(),
  tenantId:    uuid("tenant_id").references(() => tenants.id),
  workspaceId: uuid("workspace_id").references(() => workspaces.id),
  actorId:     text("actor_id").notNull().default("cm"),
  action:      text("action").notNull(),
  entityType:  text("entity_type").notNull(),
  entityId:    uuid("entity_id"),
  metadata:    jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt:   timestamp("created_at").defaultNow().notNull(),
});

// ─── Consent Records ─────────────────────────────────────────────────────────
export const consentRecords = pgTable("consent_records", {
  id:        uuid("id").defaultRandom().primaryKey(),
  tenantId:  uuid("tenant_id").notNull().references(() => tenants.id),
  leadId:    uuid("lead_id").notNull().references(() => leads.id),
  channel:   text("channel").notNull(),
  status:    text("status").notNull(),
  source:    text("source"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


// ─── Team Members (LinkedIn-connected ISH reps) ─────────────────────────────
export const teamMembers = pgTable("team_members", {
  id:              uuid("id").defaultRandom().primaryKey(),
  tenantId:        uuid("tenant_id").notNull().references(() => tenants.id),
  workspaceId:     uuid("workspace_id").notNull().references(() => workspaces.id),
  name:            text("name").notNull(),
  email:           text("email"),
  linkedInSub:     text("linkedin_sub").notNull().unique(),
  linkedInUrl:     text("linkedin_url"),
  linkedInPicture: text("linkedin_picture"),
  lastImportAt:    timestamp("last_import_at"),
  createdAt:       timestamp("created_at").defaultNow().notNull(),
  updatedAt:       timestamp("updated_at").defaultNow().notNull(),
});

// ─── LinkedIn Connections (imported 1st-degree network per rep) ───────────────
export const linkedinConnections = pgTable("linkedin_connections", {
  id:            uuid("id").defaultRandom().primaryKey(),
  memberId:      uuid("member_id").notNull().references(() => teamMembers.id, { onDelete: "cascade" }),
  firstName:     text("first_name").notNull(),
  lastName:      text("last_name").notNull(),
  linkedInUrl:   text("linkedin_url").notNull(),
  email:         text("email"),
  company:       text("company"),
  position:      text("position"),
  connectedOn:   timestamp("connected_on"),
  importBatchId: text("import_batch_id"),
  createdAt:     timestamp("created_at").defaultNow().notNull(),
  updatedAt:     timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  memberUrlIdx: uniqueIndex("linkedin_connections_member_url_idx").on(table.memberId, table.linkedInUrl),
}));

// ─── Connection Matches (cached connection → CRM contact links) ───────────────
export const connectionMatches = pgTable("connection_matches", {
  id:           uuid("id").defaultRandom().primaryKey(),
  connectionId: uuid("connection_id").notNull().references(() => linkedinConnections.id, { onDelete: "cascade" }),
  contactId:    uuid("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  matchMethod:  text("match_method").notNull(),
  confidence:   integer("confidence").notNull(),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  connectionContactIdx: uniqueIndex("connection_matches_conn_contact_idx").on(table.connectionId, table.contactId),
}));

// ─── Relations (for Drizzle query API) ────────────────────────────────────────
import { relations } from "drizzle-orm";

export const leadsRelations = relations(leads, ({ one, many }) => ({
  contact: one(contacts, { fields: [leads.contactId], references: [contacts.id] }),
  account: one(accounts, { fields: [leads.accountId], references: [accounts.id] }),
  research: one(leadResearch, { fields: [leads.id], references: [leadResearch.leadId] }),
  outreach: many(leadOutreach),
  funnel: many(yieldFunnel),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  account: one(accounts, { fields: [contacts.accountId], references: [accounts.id] }),
}));

export const accountsRelations = relations(accounts, ({ many }) => ({
  contacts: many(contacts),
  leads: many(leads),
}));

export const leadResearchRelations = relations(leadResearch, ({ one }) => ({
  lead: one(leads, { fields: [leadResearch.leadId], references: [leads.id] }),
}));

export const leadOutreachRelations = relations(leadOutreach, ({ one, many }) => ({
  lead: one(leads, { fields: [leadOutreach.leadId], references: [leads.id] }),
  approvals: many(outreachApprovals),
  editMessages: many(outreachEditMessages),
}));

export const outreachEditMessagesRelations = relations(outreachEditMessages, ({ one }) => ({
  outreach: one(leadOutreach, { fields: [outreachEditMessages.leadOutreachId], references: [leadOutreach.id] }),
}));

export const outreachApprovalsRelations = relations(outreachApprovals, ({ one }) => ({
  outreach: one(leadOutreach, { fields: [outreachApprovals.leadOutreachId], references: [leadOutreach.id] }),
  lead: one(leads, { fields: [outreachApprovals.leadId], references: [leads.id] }),
}));

export const yieldFunnelRelations = relations(yieldFunnel, ({ one }) => ({
  lead: one(leads, { fields: [yieldFunnel.leadId], references: [leads.id] }),
}));


export const teamMembersRelations = relations(teamMembers, ({ many }) => ({
  connections: many(linkedinConnections),
}));

export const linkedinConnectionsRelations = relations(linkedinConnections, ({ one, many }) => ({
  member: one(teamMembers, { fields: [linkedinConnections.memberId], references: [teamMembers.id] }),
  matches: many(connectionMatches),
}));

export const connectionMatchesRelations = relations(connectionMatches, ({ one }) => ({
  connection: one(linkedinConnections, { fields: [connectionMatches.connectionId], references: [linkedinConnections.id] }),
  contact: one(contacts, { fields: [connectionMatches.contactId], references: [contacts.id] }),
}));

