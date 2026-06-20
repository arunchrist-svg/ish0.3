export type DataMode = "free" | "paid" | "auto";

export type ScoutCompanyResult = {
  name: string;
  domain?: string;
  website?: string;
  industry?: string;
  city?: string;
  employees?: string;
  revenue?: string;
  logo?: string;
  giftScore?: number;
  giftBudget?: string;
  pastGifting?: object[];
  intelNotes?: string;
  dataSource: string;
  externalId?: string;
};

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
  bio?: string;
  isKeyDM?: boolean;
  matchScore?: number;
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
