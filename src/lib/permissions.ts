// src/lib/permissions.ts
// Single source of truth for which roles can access which pages.
// AppLayout.tsx uses this to decide what to show in the sidebar.
// RouteGuard.tsx uses this to actually block direct URL navigation.
// Change access rules HERE ONLY — never hardcode role checks elsewhere,
// or the sidebar and the real enforcement will drift out of sync again.

export type Role = "Owner" | "Pharmacist" | "Cashier";

export type PageKey =
  | "dashboard"
  | "inventory"
  | "pos"
  | "salesHistory"
  | "suppliers"
  | "reports"
  | "forecast"
  | "poisons"
  | "audit"
  | "settings";

const ROLE_PAGE_ACCESS: Record<Role, PageKey[]> = {
  Owner: [
    "dashboard", "inventory", "pos", "salesHistory",
    "suppliers", "reports", "forecast", "poisons", "audit", "settings",
  ],
  Pharmacist: [
    "dashboard", "inventory", "pos", "salesHistory",
    "reports", "forecast", "poisons", "settings",
    // deliberately excluded: suppliers, audit
  ],
  Cashier: [
    "dashboard", "inventory", "pos", "salesHistory", "poisons",
    // Poisons Register stays visible — legally required for controlled-drug dispensing
  ],
};

export function canAccessPage(role: Role | null | undefined, page: PageKey): boolean {
  if (!role) return false;
  return ROLE_PAGE_ACCESS[role]?.includes(page) ?? false;
}

// Legacy accounts (pre-multi-tenant) may have user.role === "Admin" with no
// memberRole set at all — treat those as Owner-equivalent everywhere.
export function resolveEffectiveRole(user: { memberRole?: string | null; role?: string | null } | null | undefined): Role | null {
  if (!user) return null;
  if (user.memberRole) return user.memberRole as Role;
  if (user.role === "Admin") return "Owner";
  return null;
}
