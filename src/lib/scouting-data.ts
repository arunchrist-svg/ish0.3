import type { CompanyOverview } from "@/lib/company-overview";

export type Company = {
  id: string;
  logo?: string;
  domain?: string;
  name: string;
  type: string;
  city: string;
  industry: string;
  employees: string;
  revenue: string;
  founded: number;
  giftScore: number;
  giftBudget: string;
  pastGifting: { year: string; occasion: string; items: string; perPerson: string }[];
  intelligenceNotes: string;
  overview?: CompanyOverview;
  accountId?: string;
};

export type Person = {
  id: string;
  companyId: string;
  name: string;
  title: string;
  department: string;
  seniority: string;
  isKeyDecisionMaker: boolean;
  matchScore: number;
  engagementSignals: string[];
  linkedIn: string;
  email: string;
  phone: string;
  bio: string;
};

export const SCOUT_CITIES = [
  "Bengaluru",
  "Mysore",
  "Mangalore",
  "Hubli",
  "Tumkur",
  "Hassan",
  "Belgaum",
  "Davanagere",
  "Shivamogga",
  "Bellary",
  "Udupi",
  "Hosur",
] as const;

export type ScoutCity = (typeof SCOUT_CITIES)[number];

/** Karnataka major cities + Hosur (TN border). */

export const SCOUT_CITY_META: Record<
  ScoutCity,
  { initials: string; icon: string; tagline: string }
> = {
  Bengaluru: { initials: "BLR", icon: "🏙️", tagline: "Metro & tech hub" },
  Mysore: { initials: "MYS", icon: "🏰", tagline: "Heritage & education" },
  Mangalore: { initials: "MNG", icon: "⛵", tagline: "Port city & trade" },
  Hubli: { initials: "HBL", icon: "🚂", tagline: "Rail junction & commerce" },
  Tumkur: { initials: "TMK", icon: "🌾", tagline: "Agri & logistics" },
  Hassan: { initials: "HSN", icon: "🛕", tagline: "Temple towns" },
  Belgaum: { initials: "BGM", icon: "🪖", tagline: "Border city & industry" },
  Davanagere: { initials: "DVG", icon: "🥘", tagline: "Food processing" },
  Shivamogga: { initials: "SMG", icon: "🌊", tagline: "Malnad region" },
  Bellary: { initials: "BLY", icon: "⛰️", tagline: "Mining & steel" },
  Udupi: { initials: "UDI", icon: "🥥", tagline: "Coastal trade & cuisine" },
  Hosur: { initials: "HSR", icon: "🏭", tagline: "Industrial corridor" },
};

export function getCityMeta(city: string) {
  return SCOUT_CITY_META[city as ScoutCity] ?? {
    initials: city.slice(0, 3).toUpperCase(),
    icon: "📍",
    tagline: city,
  };
}

export const SCOUT_CITY_GROUPS: { label: string; cities: ScoutCity[] }[] = [
  { label: "Metro & hub", cities: ["Bengaluru", "Mysore"] },
  { label: "Coastal Karnataka", cities: ["Mangalore", "Udupi"] },
  { label: "Central Karnataka", cities: ["Tumkur", "Hassan", "Davanagere", "Shivamogga"] },
  { label: "North Karnataka", cities: ["Hubli", "Belgaum", "Bellary"] },
  { label: "Tamil Nadu border", cities: ["Hosur"] },
];
export const SCOUT_INDUSTRIES = [
  "Manufacturing",
  "Real Estate",
  "Technology",
  "Financial Services",
  "Healthcare",
  "Retail",
  "FMCG",
  "Construction",
  "Automotive",
  "Pharmaceuticals",
  "Education",
  "Hospitality",
  "Logistics",
] as const;

export const SCOUT_SENIORITY = ["C-Level", "Founders", "VP", "Director", "Manager"] as const;
export type ScoutSeniority = (typeof SCOUT_SENIORITY)[number];

export const SCOUT_DEPARTMENTS = [
  "HR",
  "Admin",
  "Procurement",
  "Facilities",
  "Marketing",
  "Operations",
  "Leadership",
] as const;
export type ScoutDepartment = (typeof SCOUT_DEPARTMENTS)[number];

export const COMPANIES: Company[] = [
  {
    id: "c1", logo: "🔧", domain: "bosch.com", name: "Bosch India", type: "Manufacturing", city: "Hosur",
    industry: "Manufacturing", employees: "8,500", revenue: "₹12,400 Cr", founded: 1951,
    giftScore: 91, giftBudget: "₹8–12L / year",
    pastGifting: [
      { year: "2023", occasion: "Diwali", items: "Dry Fruits + Silver Coin", perPerson: "₹1,200" },
      { year: "2024", occasion: "Holi", items: "Sweets + Puja Kit", perPerson: "₹850" },
    ],
    intelligenceNotes: "HR Director posted about premium corporate gifting for Diwali 2025. Budget approved in August.",
  },
  {
    id: "c2", logo: "🏢", domain: "infosys.com", name: "Infosys Mysore", type: "IT Services", city: "Mysore",
    industry: "IT", employees: "14,200", revenue: "₹1,46,767 Cr", founded: 1981,
    giftScore: 88, giftBudget: "₹15–25L / year",
    pastGifting: [
      { year: "2023", occasion: "Diwali", items: "Gourmet Hamper", perPerson: "₹2,000" },
      { year: "2024", occasion: "Founders Day", items: "Branded Kit + Sweets", perPerson: "₹1,500" },
    ],
    intelligenceNotes: "Admin Head shortlisted vendors in Oct. Strong preference for locally-sourced premium sweets.",
  },
  {
    id: "c3", logo: "🚗", domain: "toyotabharat.com", name: "Toyota Kirloskar", type: "Automobile", city: "Bangalore",
    industry: "Manufacturing", employees: "6,300", revenue: "₹21,000 Cr", founded: 1997,
    giftScore: 76, giftBudget: "₹5–8L / year",
    pastGifting: [
      { year: "2024", occasion: "New Year", items: "Planner + Sweets Box", perPerson: "₹600" },
    ],
    intelligenceNotes: "Procurement team opens vendor enquiries every September. Prefer eco-friendly packaging.",
  },
  {
    id: "c4", logo: "🏗️", domain: "prestigeconstructions.com", name: "Prestige Group", type: "Real Estate", city: "Bangalore",
    industry: "Real Estate", employees: "3,200", revenue: "₹8,900 Cr", founded: 1986,
    giftScore: 83, giftBudget: "₹6–10L / year",
    pastGifting: [
      { year: "2023", occasion: "Diwali", items: "Luxury Sweets Box", perPerson: "₹1,800" },
      { year: "2024", occasion: "Ugadi", items: "Traditional Hamper", perPerson: "₹900" },
    ],
    intelligenceNotes: "VP HR is a decision-maker who follows gifting trends on LinkedIn. Repeat buyer potential.",
  },
  {
    id: "c5", logo: "⌚", domain: "titan.co.in", name: "Titan Company", type: "Consumer Goods", city: "Hosur",
    industry: "Manufacturing", employees: "7,100", revenue: "₹40,000 Cr", founded: 1984,
    giftScore: 64, giftBudget: "₹4–6L / year",
    pastGifting: [
      { year: "2024", occasion: "Diwali", items: "Sweets + Diary", perPerson: "₹700" },
    ],
    intelligenceNotes: "Plant HR Manager mentioned gifting budget cuts in 2024. Watch for Q3 2025 signals.",
  },
  {
    id: "c6", logo: "💊", domain: "biocon.com", name: "Biocon Limited", type: "Pharma", city: "Bangalore",
    industry: "Pharma", employees: "11,500", revenue: "₹9,750 Cr", founded: 1978,
    giftScore: 79, giftBudget: "₹7–11L / year",
    pastGifting: [
      { year: "2023", occasion: "Diwali", items: "Health Hamper", perPerson: "₹1,100" },
      { year: "2024", occasion: "Womens Day", items: "Wellness Kit", perPerson: "₹800" },
    ],
    intelligenceNotes: "CSR head drives gifting decisions. Focus on health-conscious, zero-sugar products.",
  },
  {
    id: "c7", logo: "🛍️", domain: "relianceretail.com", name: "Reliance Retail", type: "Retail", city: "Bangalore",
    industry: "Retail", employees: "22,000", revenue: "₹2,60,364 Cr", founded: 2006,
    giftScore: 72, giftBudget: "₹12–20L / year",
    pastGifting: [
      { year: "2024", occasion: "Diwali", items: "Assorted Sweets", perPerson: "₹500" },
    ],
    intelligenceNotes: "Large volumes but lower per-unit budget. Good for bulk standard orders.",
  },
  {
    id: "c8", logo: "🏭", domain: "abb.com", name: "ABB India", type: "Industrial Tech", city: "Bangalore",
    industry: "Manufacturing", employees: "5,800", revenue: "₹7,200 Cr", founded: 1949,
    giftScore: 85, giftBudget: "₹5–9L / year",
    pastGifting: [
      { year: "2023", occasion: "Diwali", items: "Premium Dry Fruits", perPerson: "₹1,400" },
      { year: "2024", occasion: "Safety Day", items: "Sweets + Company Merch", perPerson: "₹950" },
    ],
    intelligenceNotes: "Admin procurement opens gifting RFQ every October. Strong preference for premium boxes.",
  },
];

export const PEOPLE: Person[] = [
  {
    id: "p1", companyId: "c1", name: "Rajan Nair", title: "HR Director",
    department: "Human Resources", seniority: "Director", isKeyDecisionMaker: true, matchScore: 90,
    engagementSignals: ["Posted about Diwali gifting", "Liked 3 corporate gifting brand posts"],
    linkedIn: "linkedin.com/in/rajan-nair", email: "raj****.n@boschindia.com", phone: "+91 98***-**345",
    bio: "15+ years in HR. Heads 8,500-person workforce and drives all vendor gifting decisions at Bosch Hosur plant.",
  },
  {
    id: "p2", companyId: "c1", name: "Meena Pillai", title: "Admin Head",
    department: "Administration", seniority: "Manager", isKeyDecisionMaker: true, matchScore: 82,
    engagementSignals: ["Commented on premium gifting post", "Followed ISH Instagram"],
    linkedIn: "linkedin.com/in/meena-pillai", email: "m.pill**@boschindia.com", phone: "+91 80***-**211",
    bio: "Manages all vendor procurement and office administration. Final sign-off on gifting orders.",
  },
  {
    id: "p3", companyId: "c1", name: "Karthik Shenoy", title: "CSR Manager",
    department: "Corporate Affairs", seniority: "Manager", isKeyDecisionMaker: false, matchScore: 65,
    engagementSignals: ["Shared Diwali gifting article"],
    linkedIn: "linkedin.com/in/karthik-shenoy", email: "k.shen**@boschindia.com", phone: "+91 98***-**781",
    bio: "Oversees CSR initiatives including employee welfare events. Influencer in gifting vendor selection.",
  },
  {
    id: "p4", companyId: "c2", name: "Deepika Rao", title: "Chief People Officer",
    department: "Human Resources", seniority: "C-Level", isKeyDecisionMaker: true, matchScore: 95,
    engagementSignals: ["Posted about premium gifting ROI", "Attended gifting industry webinar"],
    linkedIn: "linkedin.com/in/deepika-rao", email: "d.r**@infosys.com", phone: "+91 82***-**400",
    bio: "CPO for 14,000-person Mysore campus. Sets gifting policy and approves annual vendor list.",
  },
  {
    id: "p5", companyId: "c2", name: "Suresh Babu", title: "Admin Director",
    department: "Administration", seniority: "Director", isKeyDecisionMaker: true, matchScore: 87,
    engagementSignals: ["Liked corporate sweets packaging post"],
    linkedIn: "linkedin.com/in/suresh-babu-mys", email: "s.b**@infosys.com", phone: "+91 82***-**501",
    bio: "Oversees all campus procurement. Key contact for bulk gifting orders and vendor onboarding.",
  },
  {
    id: "p6", companyId: "c2", name: "Priya Menon", title: "Events Coordinator",
    department: "Human Resources", seniority: "Associate", isKeyDecisionMaker: false, matchScore: 58,
    engagementSignals: ["Reposted gifting trend article"],
    linkedIn: "linkedin.com/in/priya-menon-inf", email: "p.m**@infosys.com", phone: "+91 82***-**602",
    bio: "Coordinates employee events and celebrations. Influences occasion-specific gifting choices.",
  },
];

// Extend PEOPLE with Bangalore companies (Toyota c3, Prestige c4, Biocon c6, Reliance c7, ABB c8)
// and Hosur company (Titan c5)
const EXTRA_PEOPLE: Person[] = [
  // Toyota Kirloskar (c3)
  {
    id: "p7", companyId: "c3", name: "Arun Kumar", title: "Admin Head",
    department: "Administration", seniority: "Manager", isKeyDecisionMaker: true, matchScore: 78,
    engagementSignals: ["Enquired about eco-friendly gifting", "Liked ISH packaging post"],
    linkedIn: "linkedin.com/in/arun-kumar-toyota", email: "a.kum**@toyota-kirloskar.com", phone: "+91 80***-**910",
    bio: "Heads all vendor procurement for Toyota Kirloskar. Favours eco-friendly vendors with premium presentation.",
  },
  {
    id: "p8", companyId: "c3", name: "Sneha Rao", title: "HR Manager",
    department: "Human Resources", seniority: "Manager", isKeyDecisionMaker: true, matchScore: 71,
    engagementSignals: ["Posted about New Year gifting traditions"],
    linkedIn: "linkedin.com/in/sneha-rao-toyota", email: "s.r**@toyota-kirloskar.com", phone: "+91 80***-**921",
    bio: "Manages employee experience and vendor gifting calendar. Decision-maker for Q4 gifting cycle.",
  },
  {
    id: "p9", companyId: "c3", name: "Vinod Sharma", title: "CSR Lead",
    department: "Corporate Affairs", seniority: "Manager", isKeyDecisionMaker: false, matchScore: 55,
    engagementSignals: ["Shared sustainable gifting article"],
    linkedIn: "linkedin.com/in/vinod-sharma-tky", email: "v.sh**@toyota-kirloskar.com", phone: "+91 80***-**932",
    bio: "Leads CSR projects and employee welfare. Advocates for local artisan-sourced gift products.",
  },
  // Prestige Group (c4)
  {
    id: "p10", companyId: "c4", name: "Kavya Reddy", title: "VP Human Resources",
    department: "Human Resources", seniority: "Director", isKeyDecisionMaker: true, matchScore: 85,
    engagementSignals: ["Liked premium gifting trends post", "Commented on luxury hamper thread"],
    linkedIn: "linkedin.com/in/kavya-reddy-prestige", email: "k.red**@prestigegroup.com", phone: "+91 80***-**200",
    bio: "VP HR for Prestige Group. Oversees all gifting vendor empanelment and approval for 3,200 employees.",
  },
  {
    id: "p11", companyId: "c4", name: "Rahul Iyer", title: "Admin Director",
    department: "Administration", seniority: "Director", isKeyDecisionMaker: true, matchScore: 79,
    engagementSignals: ["Posted about Ugadi celebrations at office"],
    linkedIn: "linkedin.com/in/rahul-iyer-prestige", email: "r.iy**@prestigegroup.com", phone: "+91 80***-**211",
    bio: "Manages day-to-day office operations. Final approver on gifting POs above ₹50K.",
  },
  {
    id: "p12", companyId: "c4", name: "Nandini Bose", title: "Employee Experience Manager",
    department: "Human Resources", seniority: "Manager", isKeyDecisionMaker: false, matchScore: 62,
    engagementSignals: ["Followed ISH Instagram", "Shared Diwali gifting idea reel"],
    linkedIn: "linkedin.com/in/nandini-bose-prestige", email: "n.bo**@prestigegroup.com", phone: "+91 80***-**222",
    bio: "Curates employee engagement events. Proposes gifting vendors and manages distribution logistics.",
  },
  // Biocon Limited (c6)
  {
    id: "p13", companyId: "c6", name: "Dr. Ananya Menon", title: "Chief People Officer",
    department: "Human Resources", seniority: "C-Level", isKeyDecisionMaker: true, matchScore: 82,
    engagementSignals: ["Attended wellness gifting summit", "Liked zero-sugar sweets post"],
    linkedIn: "linkedin.com/in/ananya-menon-biocon", email: "a.men**@biocon.com", phone: "+91 80***-**500",
    bio: "CPO at Biocon. Champions health-conscious gifting culture. Drives all festive gifting policy.",
  },
  {
    id: "p14", companyId: "c6", name: "Srinivas Gowda", title: "Admin Head",
    department: "Administration", seniority: "Manager", isKeyDecisionMaker: true, matchScore: 75,
    engagementSignals: ["Requested gifting catalog from ISH"],
    linkedIn: "linkedin.com/in/srinivas-gowda-biocon", email: "s.gow**@biocon.com", phone: "+91 80***-**511",
    bio: "Heads admin and facilities. Key contact for annual gifting vendor RFQ at Biocon.",
  },
  {
    id: "p15", companyId: "c6", name: "Pooja Nair", title: "CSR & Wellness Lead",
    department: "Corporate Affairs", seniority: "Manager", isKeyDecisionMaker: false, matchScore: 60,
    engagementSignals: ["Shared article on health hampers"],
    linkedIn: "linkedin.com/in/pooja-nair-biocon", email: "p.na**@biocon.com", phone: "+91 80***-**522",
    bio: "Leads Biocon CSR and wellness initiatives. Strong preference for nutraceutical gifting options.",
  },
  // ABB India (c8)
  {
    id: "p16", companyId: "c8", name: "Manoj Hegde", title: "HR Director",
    department: "Human Resources", seniority: "Director", isKeyDecisionMaker: true, matchScore: 88,
    engagementSignals: ["Posted about Safety Day gifting", "Liked premium dry fruits post"],
    linkedIn: "linkedin.com/in/manoj-hegde-abb", email: "m.heg**@abb.com", phone: "+91 80***-**700",
    bio: "HR Director for ABB India. Has run gifting RFQs for 3+ years. Strong ISH brand awareness.",
  },
  {
    id: "p17", companyId: "c8", name: "Lakshmi Rao", title: "Procurement Manager",
    department: "Finance", seniority: "Manager", isKeyDecisionMaker: true, matchScore: 80,
    engagementSignals: ["Opened ISH vendor brochure email"],
    linkedIn: "linkedin.com/in/lakshmi-rao-abb", email: "l.ra**@abb.com", phone: "+91 80***-**711",
    bio: "Handles all vendor empanelment for ABB India. Signs off on gifting purchase orders each October.",
  },
  {
    id: "p18", companyId: "c8", name: "Kiran Kulkarni", title: "Admin Coordinator",
    department: "Administration", seniority: "Associate", isKeyDecisionMaker: false, matchScore: 53,
    engagementSignals: ["Requested gifting quote from team"],
    linkedIn: "linkedin.com/in/kiran-kulkarni-abb", email: "k.kul**@abb.com", phone: "+91 80***-**722",
    bio: "Coordinates admin activities for ABB India. First point of contact for gifting vendor queries.",
  },
];

PEOPLE.push(...EXTRA_PEOPLE);
