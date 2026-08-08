import { describe, expect, it } from "vitest";
import { isAdminUser } from "./adminAccess.js";

describe("isAdminUser", () => {
  it("accepts Supabase app_metadata admin roles", () => {
    expect(isAdminUser({ app_metadata: { role: "admin" } })).toBe(true);
    expect(isAdminUser({ app_metadata: { roles: ["member", "owner"] } })).toBe(true);
    expect(isAdminUser({ app_metadata: { admin: true } })).toBe(true);
  });

  it("rejects signed-in users without server-controlled admin metadata", () => {
    expect(isAdminUser({ id: "user-1", email: "user@example.com" })).toBe(false);
    expect(isAdminUser({ user_metadata: { role: "admin", admin: true } })).toBe(false);
  });
});
