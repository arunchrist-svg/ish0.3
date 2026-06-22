export type QueueItem = {
  id: string;
  name: string;
  action: string;
  type: string;
  date: string;
  score: number;
  icon: "mail" | "phone";
  company: string;
  title: string;
};

export type UpNextTask = {
  title: string;
  step: string;
  desc: string;
  icon: "package" | "phone" | "file" | "mail";
  active: boolean;
  primaryAction?: string;
};

export type LeadRecord = {
  name: string;
  leadSource: string;
  rating: string;
  status: string;
  owner: string;
  tags: string[];
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    businessPhone: string;
    mobilePhone: string;
    linkedIn: string;
  };
  company: {
    employees: string;
    city: string;
    location: string;
  };
  upNext: UpNextTask[];
  score: {
    value: number;
    grade: string;
    trend: string;
    factors: { label: string; bold: string }[];
  };
  network: {
    name: string;
    email?: string;
    linkedIn?: string;
    strength?: 1 | 2 | 3 | 4;
    relationship?: string;
    connectorName?: string;
    path?: string[];
  }[];
  giftingIntelligence: string;
};

export const QUEUE: QueueItem[] = [
  { id: "l1", name: "Rajan Nair", action: "First customer call", type: "Lead", date: "6.20.2026 9:14 am", score: 90, icon: "mail", company: "Bosch India", title: "HR Director" },
  { id: "l2", name: "Priya Menon", action: "Follow up mail", type: "Lead", date: "6.20.2026 9:14 am", score: 83, icon: "phone", company: "Prestige Group", title: "VP Sales" },
  { id: "l3", name: "Arun Kumar", action: "First customer call", type: "Lead", date: "6.20.2026 9:14 am", score: 92, icon: "phone", company: "Toyota Kirloskar", title: "Admin Head" },
  { id: "l4", name: "Deepika Rao", action: "Follow up mail", type: "Lead", date: "3 weeks ago", score: 95, icon: "mail", company: "Infosys Mysore", title: "Chief People Officer" },
  { id: "l5", name: "Suresh Babu", action: "First customer call", type: "Lead", date: "3 weeks ago", score: 72, icon: "phone", company: "Titan Company", title: "Plant HR Manager" },
];

export const RECORD: LeadRecord = {
  name: "Rajan Nair",
  leadSource: "LinkedIn",
  rating: "Warm",
  status: "New",
  owner: "ISH Cluster Mgr",
  tags: ["Lead", "Gifting Signal"],
  contact: {
    firstName: "Rajan",
    lastName: "Nair",
    email: "rajan.nair@boschindia.com",
    businessPhone: "+91 80-2571-1234",
    mobilePhone: "+91 98450-12345",
    linkedIn: "linkedin.com/in/rajan-nair",
  },
  company: { employees: "8,500", city: "Hosur", location: "Hosur, Karnataka" },
  upNext: [
    { title: "Send Tasting Box", step: "Step 1 · Due today 3:00 pm", desc: "Courier complimentary tasting box to office", icon: "package", active: true, primaryAction: "Mark Sent" },
    { title: "Follow-up Call", step: "Step 2", desc: "Call 24hrs after delivery confirmation", icon: "phone", active: false },
    { title: "Send Quote", step: "Step 3 · Due 6.24.2026", desc: "Volume pricing for 500+ box order", icon: "file", active: false },
  ],
  score: {
    value: 90,
    grade: "Grade A",
    trend: "Steady",
    factors: [
      { label: "Purchase timeframe is", bold: "next quarter" },
      { label: "Purchase process is", bold: "individual" },
      { label: "Lead is", bold: "relatively new" },
      { label: "Estimated budget is", bold: "₹18,00,000" },
    ],
  },
  network: [
    { name: "Arun Krishnan", email: "arun.k@boschindia.com" },
    { name: "Meera Pillai", email: "meera.p@boschindia.com" },
  ],
  giftingIntelligence: "Posted about employee appreciation on LinkedIn. Approved last 2 vendor contracts. Open to outreach — replied to similar vendor within 48hrs historically.",
};

export { PIPELINE_STAGES as STAGES } from "./pipeline-status";

export function getInitials(name: string) {
  return (name || "??").split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

export function getScoreGrade(score: number) {
  if (score > 85) return "A";
  if (score > 65) return "B";
  return "C";
}
