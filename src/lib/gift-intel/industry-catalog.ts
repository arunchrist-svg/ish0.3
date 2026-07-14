export type IndustryCatalogEntry = {
  id: string;
  label: string;
  keywords: string[];
  suggestedCompetitors: string[];
};

export const INDUSTRY_CATALOG: IndustryCatalogEntry[] = [
  {
    id: "kitchen-appliances",
    label: "Kitchen Appliances",
    keywords: ["kitchen", "appliances", "cookware", "kit", "cooking", "mixer", "blender", "otg"],
    suggestedCompetitors: ["Prestige", "Bajaj Electricals", "Hawkins", "Philips", "Kent", "Butterfly"],
  },
  {
    id: "sweets",
    label: "Sweets",
    keywords: ["sweet", "mithai", "confectionery", "dessert", "bakery", "chocolates"],
    suggestedCompetitors: ["Kanti Sweets", "Anand Sweets", "Haldiram's", "MTR Foods", "Karachi Bakery"],
  },
  {
    id: "enterprise-software",
    label: "Enterprise Software",
    keywords: ["software", "saas", "b2b", "enterprise", "erp", "crm", "cloud"],
    suggestedCompetitors: ["Salesforce", "Microsoft", "Oracle", "SAP", "Zoho", "HubSpot"],
  },
  {
    id: "fintech",
    label: "Fintech",
    keywords: ["fintech", "payments", "banking", "lending", "insurance", "wealth"],
    suggestedCompetitors: ["Razorpay", "Paytm", "PhonePe", "CRED", "BharatPe", "Policybazaar"],
  },
  {
    id: "fashion-apparel",
    label: "Fashion & Apparel",
    keywords: ["fashion", "apparel", "clothing", "garments", "retail", "wear"],
    suggestedCompetitors: ["Fabindia", "Manyavar", "Biba", "W", "Allen Solly", "Zudio"],
  },
  {
    id: "healthcare",
    label: "Healthcare",
    keywords: ["healthcare", "hospital", "pharma", "medical", "diagnostics", "clinic"],
    suggestedCompetitors: ["Apollo", "Fortis", "Max Healthcare", "Manipal", "Narayana Health", "Dr. Lal PathLabs"],
  },
  {
    id: "real-estate",
    label: "Real Estate",
    keywords: ["real estate", "property", "housing", "developer", "construction", "builder"],
    suggestedCompetitors: ["DLF", "Godrej Properties", "Prestige Group", "Lodha", "Sobha", "Brigade"],
  },
  {
    id: "edtech",
    label: "EdTech",
    keywords: ["edtech", "education", "learning", "coaching", "courses", "training"],
    suggestedCompetitors: ["BYJU'S", "Unacademy", "PhysicsWallah", "upGrad", "Coursera", "Khan Academy"],
  },
  {
    id: "automotive",
    label: "Automotive",
    keywords: ["automotive", "auto", "cars", "vehicles", "ev", "two-wheeler"],
    suggestedCompetitors: ["Maruti Suzuki", "Hyundai", "Tata Motors", "Mahindra", "Honda", "TVS"],
  },
  {
    id: "consumer-electronics",
    label: "Consumer Electronics",
    keywords: ["electronics", "gadgets", "mobile", "tv", "audio", "laptop"],
    suggestedCompetitors: ["Samsung", "Apple", "Xiaomi", "OnePlus", "Sony", "LG"],
  },
];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function getIndustryByLabel(label: string): IndustryCatalogEntry | null {
  const normalized = normalize(label);
  if (!normalized) return null;
  return INDUSTRY_CATALOG.find((entry) => normalize(entry.label) === normalized) ?? null;
}

export function searchIndustries(query: string, limit = 8): IndustryCatalogEntry[] {
  const q = normalize(query);
  if (!q) return INDUSTRY_CATALOG.slice(0, limit);

  const scored = INDUSTRY_CATALOG.map((entry) => {
    const label = normalize(entry.label);
    let score = 0;
    if (label === q) score += 100;
    else if (label.startsWith(q)) score += 60;
    else if (label.includes(q)) score += 40;

    for (const keyword of entry.keywords) {
      if (keyword === q) score += 50;
      else if (keyword.startsWith(q)) score += 30;
      else if (q.startsWith(keyword)) score += 25;
      else if (keyword.includes(q)) score += 15;
    }

    return { entry, score };
  })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.entry.label.localeCompare(b.entry.label));

  return scored.slice(0, limit).map(({ entry }) => entry);
}
