import type { CompanyOverview } from "@/lib/company-overview";

export type DataMode = "free" | "paid" | "auto";

export type ScoutCompanyResult = {
  name: string;
  domain?: string;
  website?: string;
  industry?: string;
  city?: string;
  employees?: string;
  logo?: string;
  fitScore?: number;
  budgetBand?: string;
  pastGifting?: object[];
  intelNotes?: string;
  revenue?: string;
  companyOverview?: CompanyOverview;
  dataSource: string;
  externalId?: string;
  leadabilityScore?: number;
  leadabilityBand?: "high" | "medium" | "low" | "unknown";
  leadabilityMatchedPeople?: number;
  leadabilityMatchedInCity?: number;
  leadabilityProbeSource?: string;
  /** Set when returned under a Focus Area Places location bias circle. */
  scoutGeoVerified?: boolean;
  fitScoreReason?: string;
};

export type ScoutPersonSeat = "plant" | "nearby_hq";

export type ScoutPersonResult = {
  name: string;
  firstName?: string;
  lastName?: string;
  title?: string;
  department?: string;
  seniority?: string;
  email?: string;
  emailStatus: "verified" | "unverified" | "missing" | "generic";
  phone?: string;
  linkedIn?: string;
  location?: string;
  bio?: string;
  isKeyDM?: boolean;
  matchScore?: number;
  matchScoreReason?: string;
  /**
   * Plant-seat scout only: person sits at the plant city, or was kept as nearby HQ
   * after the plant search returned nobody.
   */
  seat?: ScoutPersonSeat;
  engagementSignals?: string[];
  dataSource: string;
  externalId?: string;
};

export type EmailVerifyResult = {
  email: string;
  status: "verified" | "unverified" | "generic" | "missing";
  isPersonal: boolean;
  provider?: string;
};
