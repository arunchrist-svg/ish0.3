import { describe, expect, it } from "vitest";
import { buildTeamInviteEmail } from "@/lib/email/invite-email";
import { inboxSetupGuide, inboxSetupHtml, isSmtpServerId } from "@/lib/email/inbox-setup-guide";
import { safeInternalNextPath } from "@/lib/auth/complete-login";

describe("inbox setup guide", () => {
  it("covers Zoho India App Password and smtp.zoho.in", () => {
    const guide = inboxSetupGuide("zoho_in");
    expect(guide.label).toBe("Zoho India");
    expect(guide.host).toBe("smtp.zoho.in");
    expect(guide.steps.map((s) => s.title).join(" ")).toMatch(/App Password/);
    const html = inboxSetupHtml("zoho_in");
    expect(html).toContain("mail.zoho.in");
    expect(html).toContain("smtp.zoho.in");
    expect(html).not.toContain("—");
  });

  it("covers Gmail 2-step and App Password", () => {
    const html = inboxSetupHtml("gmail");
    expect(html).toContain("smtp.gmail.com");
    expect(html).toContain("2-Step Verification");
  });

  it("narrows mail host ids", () => {
    expect(isSmtpServerId("zoho_in")).toBe(true);
    expect(isSmtpServerId("gmail")).toBe(true);
    expect(isSmtpServerId("outlook")).toBe(false);
  });
});

describe("team invite email", () => {
  it("includes join link and Zoho India steps for an existing teammate", () => {
    const message = buildTeamInviteEmail({
      tenantName: "ISH Gifting",
      inviteUrl: "https://app.example.com/login?next=%2Fsettings%3Ftab%3Demail%26mail%3Dzoho_in",
      role: "admin",
      mailHost: "zoho_in",
      existingUser: true,
    });
    expect(message.subject).toContain("Zoho India");
    expect(message.html).toContain("Open Nebula and sign in");
    expect(message.html).toContain("smtp.zoho.in");
    expect(message.html).toContain("App Passwords");
    expect(message.html).toContain("login?next=");
    expect(message.html).not.toContain("—");
  });

  it("uses signup CTA when the person is new", () => {
    const message = buildTeamInviteEmail({
      tenantName: "ISH Gifting",
      inviteUrl: "https://app.example.com/signup?invite=abc&mail=gmail",
      role: "member",
      mailHost: "gmail",
      existingUser: false,
    });
    expect(message.subject).toContain("Gmail");
    expect(message.html).toContain("Accept invite and create your login");
    expect(message.html).toContain("smtp.gmail.com");
  });
});

describe("safeInternalNextPath", () => {
  it("allows in-app settings deep links", () => {
    expect(safeInternalNextPath("/settings?tab=email&mail=zoho_in")).toBe(
      "/settings?tab=email&mail=zoho_in",
    );
  });

  it("rejects open redirects", () => {
    expect(safeInternalNextPath("https://evil.example")).toBeNull();
    expect(safeInternalNextPath("//evil.example")).toBeNull();
    expect(safeInternalNextPath("/\\evil.example")).toBeNull();
  });
});
