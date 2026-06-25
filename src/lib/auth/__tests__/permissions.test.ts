import { describe, expect, it } from "vitest";
import {
  canViewPlatformKeys,
  canManageBilling,
  canManageTeam,
  canManageSettings,
  canWritePipeline,
  isReadOnly,
  canChangeMemberRole,
} from "@/lib/auth/permissions";
import type { TenantRole } from "@/lib/tenant";

const ROLES: TenantRole[] = ["owner", "admin", "member", "viewer"];
const SUPER = "superadmin" as const;

describe("AUTH-UNIT-001 permissions matrix", () => {
  it("superadmin can view platform keys", () => {
    expect(canViewPlatformKeys(SUPER)).toBe(true);
    expect(canViewPlatformKeys("user")).toBe(false);
  });

  it.each([
    ["owner", true],
    ["admin", false],
    ["member", false],
    ["viewer", false],
  ] as const)("canManageBilling for %s => %s", (role, expected) => {
    expect(canManageBilling(role, "user")).toBe(expected);
  });

  it("superadmin can manage billing regardless of tenant role", () => {
    expect(canManageBilling("viewer", SUPER)).toBe(true);
  });

  it.each([
    ["owner", true],
    ["admin", true],
    ["member", false],
    ["viewer", false],
  ] as const)("canManageTeam for %s => %s", (role, expected) => {
    expect(canManageTeam(role, "user")).toBe(expected);
  });

  it.each([
    ["owner", true],
    ["admin", true],
    ["member", false],
    ["viewer", false],
  ] as const)("canManageSettings for %s => %s", (role, expected) => {
    expect(canManageSettings(role, "user")).toBe(expected);
  });

  it.each([
    ["owner", true],
    ["admin", true],
    ["member", true],
    ["viewer", false],
  ] as const)("canWritePipeline for %s => %s", (role, expected) => {
    expect(canWritePipeline(role, "user")).toBe(expected);
  });

  it("only viewer is read-only", () => {
    for (const role of ROLES) {
      expect(isReadOnly(role)).toBe(role === "viewer");
    }
  });

  it("owner can change member and viewer roles", () => {
    expect(canChangeMemberRole("owner", "member")).toBe(true);
    expect(canChangeMemberRole("owner", "viewer")).toBe(true);
    expect(canChangeMemberRole("owner", "admin")).toBe(true);
  });

  it("admin can only change member and viewer", () => {
    expect(canChangeMemberRole("admin", "member")).toBe(true);
    expect(canChangeMemberRole("admin", "viewer")).toBe(true);
    expect(canChangeMemberRole("admin", "admin")).toBe(false);
  });

  it("cannot change owner role", () => {
    expect(canChangeMemberRole("owner", "owner")).toBe(false);
    expect(canChangeMemberRole("admin", "owner")).toBe(false);
  });

  it("member cannot change roles", () => {
    expect(canChangeMemberRole("member", "viewer")).toBe(false);
  });
});
