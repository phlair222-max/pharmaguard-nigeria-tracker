// =====================================================================
// src/lib/apiKeyUtils.ts
//
// Utilities for generating and managing Modular API keys.
// Column names match confirmed live schema:
//   api_keys: id, org_id, key_hash, key_prefix, name, scopes,
//             is_active, created_by, created_at, last_used_at, revoked_at
//
// The raw key is shown ONCE at creation time, then discarded.
// Only the SHA-256 hash is persisted in the database.
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

// ── Create ────────────────────────────────────────────────────────────────────

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

// ── List ──────────────────────────────────────────────────────────────────────

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

// ── List all keys across all orgs (Platform Admin only) ───────────────────────

export async function listAllApiKeys(): Promise<ApiKey[]> {
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, org_id, name, key_prefix, scopes, is_active, created_at, last_used_at, revoked_at")
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

// ── Toggle org API access (Platform Admin only) ───────────────────────────────

export async function setOrgApiAccess(orgId: string, enabled: boolean): Promise<void> {
  const { error } = await (supabase.from as any)("organizations")
    .update({ api_access_enabled: enabled })
    .eq("id", orgId);

  if (error) throw new Error(error.message);
}
