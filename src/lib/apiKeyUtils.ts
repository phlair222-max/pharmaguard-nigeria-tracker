// =====================================================================
// src/lib/apiKeyUtils.ts
//
// Utilities for generating and managing Modular API keys and
// API-only client organizations.
// Column names match confirmed live schema:
//   api_keys: id, org_id, key_hash, key_prefix, name, scopes,
//             is_active, created_by, created_at, last_used_at, revoked_at
//   organizations: ..., subscription_tier, api_access_enabled, owner_id, email
//
// The raw key is shown ONCE at creation time, then discarded.
// Only the SHA-256 hash is persisted in the database.
//
// This is a STANDALONE B2B product. API clients are their own org rows
// (subscription_tier = 'api_only') with no relationship to pharmacy app
// tiers (free/basic/pro). Nothing here is invoked from the pharmacy app.
// =====================================================================

import { supabase } from "@/integrations/supabase/client";

// ── Key generation ────────────────────────────────────────────────────────────

function generateRawKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex   = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
  return `pg_live_${hex}`;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf  = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Types ─────────────────────────────────────────────────────────────────────

export const ALL_SCOPES = [
  "inventory:read",
  "inventory:write",
  "sales:write",
  "sales_history:read",
  "poison_register:read",
  "poison_register:write",
  "disposal_report:read",
  "reports:read",
  "audit_trail:read",
] as const;

export type ApiScope = (typeof ALL_SCOPES)[number];

export interface ApiKey {
  id:           string;
  orgId:        string;
  name:         string;
  keyPrefix:    string;
  scopes:       ApiScope[];
  isActive:     boolean;
  createdAt:    string;
  lastUsedAt:   string | null;
  revokedAt:    string | null;
}

export interface CreatedApiKey {
  rawKey:    string;  // Show ONCE, then discard — never stored
  keyPrefix: string;
  id:        string;
}

export interface ApiClientOrg {
  id:                string;
  name:              string;
  email:             string | null;
  subscriptionTier:  string;
  apiAccessEnabled:  boolean;
  status:            string;
  createdAt:         string;
}

// ── Create API-only client org (Platform Admin only) ───────────────────────────
// owner_id is NOT NULL on organizations, but API clients never log in.
// The platform admin's own uid is used as a nominal owner — satisfies the
// constraint without implying a real pharmacy-app login will ever happen.

export async function createApiOnlyOrg(params: {
  name:         string;
  contactEmail: string;
  adminUid:     string;
}): Promise<string> {
  const { data, error } = await (supabase.from as any)("organizations")
    .insert({
      name:               params.name,
      email:              params.contactEmail,
      owner_id:           params.adminUid,
      subscription_tier:  "api_only",
      status:             "active",
      api_access_enabled: true,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id;
}

// ── List all API client orgs (api_only tier, or any org with the add-on flag on) ──

export async function listApiClientOrgs(): Promise<ApiClientOrg[]> {
  const { data, error } = await (supabase.from as any)("organizations")
    .select("id, name, email, subscription_tier, api_access_enabled, status, created_at")
    .or("subscription_tier.eq.api_only,api_access_enabled.eq.true")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((r: any) => ({
    id:               r.id,
    name:             r.name,
    email:            r.email,
    subscriptionTier: r.subscription_tier,
    apiAccessEnabled: r.api_access_enabled,
    status:           r.status,
    createdAt:        r.created_at,
  }));
}

// ── Toggle org API access (Platform Admin only) ───────────────────────────────
// Used both to provision api_only clients and to grant the Pro add-on to
// an existing pharmacy org, should that model ever be used.

export async function setOrgApiAccess(orgId: string, enabled: boolean): Promise<void> {
  const { error } = await (supabase.from as any)("organizations")
    .update({ api_access_enabled: enabled })
    .eq("id", orgId);

  if (error) throw new Error(error.message);
}

// ── Create key ────────────────────────────────────────────────────────────────

export async function createApiKey(params: {
  orgId:  string;
  name:   string;
  scopes: ApiScope[];
}): Promise<CreatedApiKey> {
  const rawKey    = generateRawKey();
  const keyHash   = await sha256Hex(rawKey);
  const keyPrefix = rawKey.slice(0, 12); // e.g. "pg_live_8f2a"

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      org_id:     params.orgId,
      key_hash:   keyHash,
      key_prefix: keyPrefix,
      name:       params.name,
      scopes:     params.scopes,
      is_active:  true,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return { rawKey, keyPrefix, id: data.id };
}

// ── List keys for one org ───────────────────────────────────────────────────────

export async function listApiKeys(orgId: string): Promise<ApiKey[]> {
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, org_id, name, key_prefix, scopes, is_active, created_at, last_used_at, revoked_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map(r => ({
    id:         r.id,
    orgId:      r.org_id,
    name:       r.name,
    keyPrefix:  r.key_prefix,
    scopes:     r.scopes as ApiScope[],
    isActive:   r.is_active,
    createdAt:  r.created_at,
    lastUsedAt: r.last_used_at,
    revokedAt:  r.revoked_at,
  }));
}

// ── Revoke ────────────────────────────────────────────────────────────────────
// Soft delete only — row stays for audit trail.

export async function revokeApiKey(keyId: string): Promise<void> {
  const { error } = await supabase
    .from("api_keys")
    .update({
      is_active:  false,
      revoked_at: new Date().toISOString(),
    })
    .eq("id", keyId);

  if (error) throw new Error(error.message);
}

// ── Reactivate ────────────────────────────────────────────────────────────────

export async function reactivateApiKey(keyId: string): Promise<void> {
  const { error } = await supabase
    .from("api_keys")
    .update({
      is_active:  true,
      revoked_at: null,
    })
    .eq("id", keyId);

  if (error) throw new Error(error.message);
}
