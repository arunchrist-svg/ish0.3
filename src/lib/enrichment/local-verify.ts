import {
  isGenericCompanyEmail,
  sanitizeEmail,
  sanitizePhone,
  isValidIndianPhone,
} from "./validate-contact";

export type ContactRiskLevel = "safe" | "caution" | "warning" | "high_risk";

export type ContactVerificationCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail?: string;
};

export type VerifyContactInput = {
  name: string;
  company: string;
  email?: string | null;
  phone?: string | null;
};

function riskFromChecks(checks: ContactVerificationCheck[]): ContactRiskLevel {
  const failed = checks.filter((c) => !c.passed);
  if (failed.some((c) => c.id === "phone_mangled" || c.id === "phone_invalid")) return "high_risk";
  if (failed.some((c) => c.id === "email_valid" && !c.passed)) return "warning";
  if (failed.some((c) => c.id === "company_desk_email")) return "caution";
  if (!failed.length) return "safe";
  return "caution";
}

export function runLocalVerification(input: VerifyContactInput) {
  const checks: ContactVerificationCheck[] = [];
  const email = sanitizeEmail(input.email);
  const phone = sanitizePhone(input.phone);
  const rawPhone = input.phone?.replace(/\D/g, "") ?? "";

  checks.push({
    id: "has_contact",
    label: "Contact present",
    passed: Boolean(email || phone),
    detail: email || phone ? "Email or phone on file" : "No contact info to verify",
  });

  if (input.email) {
    checks.push({
      id: "email_valid",
      label: "Email format",
      passed: Boolean(email),
      detail: email ? "Valid email format" : "Invalid or scraped garbage email",
    });
    checks.push({
      id: "company_desk_email",
      label: "Direct email",
      passed: !isGenericCompanyEmail(input.email),
      detail: isGenericCompanyEmail(input.email)
        ? "Generic company inbox"
        : "Looks like a direct or role-based address",
    });
  }

  if (input.phone) {
    const mangled = rawPhone.length === 10 && rawPhone.startsWith("91");
    checks.push({
      id: "phone_mangled",
      label: "Phone not truncated",
      passed: !mangled,
      detail: mangled ? "Number looks like a mangled +91 prefix" : "No truncation pattern detected",
    });
    checks.push({
      id: "phone_invalid",
      label: "Phone format",
      passed: Boolean(phone) && isValidIndianPhone(phone!),
      detail: phone ? "Valid 10-digit Indian mobile" : "Invalid or suspicious phone format",
    });
  }

  const riskLevel = riskFromChecks(checks);
  return { checks, riskLevel };
}
