const ADMIN_ROLES = new Set(["admin", "owner", "super_admin"]);

export function isAdminUser(user) {
  const metadata = user?.app_metadata && typeof user.app_metadata === "object"
    ? user.app_metadata
    : {};
  const role = String(metadata.role || "").trim().toLowerCase();
  const roles = Array.isArray(metadata.roles)
    ? metadata.roles.map((value) => String(value || "").trim().toLowerCase())
    : [];

  return Boolean(
    metadata.admin === true ||
    ADMIN_ROLES.has(role) ||
    roles.some((value) => ADMIN_ROLES.has(value))
  );
}
