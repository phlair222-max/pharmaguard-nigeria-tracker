// =====================================================================
// PharmaGuard NG — Modular API Gateway
// supabase/functions/api-gateway/index.ts
//
// SECURITY INVARIANTS:
// 1. org_id is resolved ONLY from the api_keys row — never from caller input.
//    STEP 30e: every write goes through a database function (Step 30d) that
//    receives only the key id and looks the organization up again itself.
// 2. Every request checks these gates, in order:
//    a. Key validity: is this key active and unrevoked?
//    b. Rate limit: has this key exceeded its per-minute request budget?
//       (anti-abuse — protects infra, not tied to billing)
//    c. Org gate: does this org have api_access_enabled = true?
//    d. Tier gate: does this org's subscription tier have can_api_access?
//       STEP 30e: and does the plan include the feature this route uses?
//       (Poisons Register, Reports, Audit trail, Disposal report, sales
//       history days — the same switches as the pharmacy app's plans)
//    e. Monthly quota: has this org exceeded its included monthly request
//       count? (billing gate — separate from the rate limit above)
//    f. Scope gate: does this key have the scope this route requires?
//    Any one gate can independently reject the request.
// 3. API access is a STANDALONE product. It is gated by the org's own
//    subscription_tier value (e.g. 'api_only'), never by whether that
//    org also happens to use the pharmacy app.
// 4. POST /inventory/bulk accepts up to 100 products in a single request.
//    Invalid rows are skipped and reported; valid rows are still created.
//    This is ONE request against rate limit + quota, regardless of how
//    many products are in the array.
// 5. STEP 30e: POST /sales and POST /poison_register are back, rebuilt on
//    the database functions api_record_sale and api_record_register_entries:
//    all-or-nothing, a named pharmacist + PIN for controlled medicines, safe
//    to resend. POST and PATCH /inventory use api_create_products and
//    api_update_product (atomic "adjust by", optional expected quantity).
// 6. STEP 30e: cost prices and profit are only returned to keys with the
//    margins:read permission. Request bodies (they can contain a PIN) are
//    never logged.
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Route table: "resource:METHOD" -> required scope
// "inventory_bulk:POST" is a synthetic key — resolved specially below,
// since /inventory/bulk shares the inventory:write scope but is a
// distinct route with its own handler and its own item cap.
const ROUTE_SCOPES: Record<string, string> = {
  "inventory:GET":          "inventory:read",
  "inventory:POST":         "inventory:write",
  "inventory:PATCH":        "inventory:write",
  "inventory_bulk:POST":    "inventory:write",
  "sales:POST":             "sales:write",
  "sales_history:GET":      "sales_history:read",
  "poison_register:GET":    "poison_register:read",
  "poison_register:POST":   "poison_register:write",
  "disposal_report:GET":    "disposal_report:read",
  "reports:GET":            "reports:read",
  "audit_trail:GET":        "audit_trail:read",
};

// STEP 30e: plan switches per route (plan_config columns)
const PLAN_FEATURES: Record<string, { flag: string; label: string }> = {
  poison_register: { flag: "can_poisons_register", label: "The Poisons Register" },
  reports:         { flag: "can_reports",          label: "Reports" },
  audit_trail:     { flag: "can_audit_trail",      label: "The audit trail" },
  disposal_report: { flag: "can_disposal_report",  label: "The disposal report" },
};

const BULK_INVENTORY_MAX = 100;
const MAX_BODY_CHARS = 1_000_000;   // STEP 30e
const PAGE_SIZE = 1000;             // STEP 30e: the most rows the database returns per request
const MAX_PAGES = 50;               // STEP 30e: reports read at most 50,000 rows
const LAGOS_TZ = "Africa/Lagos";    // STEP 30e: "today" for expiry, as in the app

// STEP 30e: database error codes from the Step 30d functions -> HTTP status
const DB_ERROR_STATUS: Record<string, number> = {
  PGA40: 400,   // the request is wrong (message says what)
  PGA43: 403,   // key / plan / permission
  PGA44: 404,   // not found in this pharmacy
  PGA49: 409,   // an id was already used for something else
  "23505": 409, // an id is already in use
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
};

type Ctx = {
  orgId: string;
  keyId: string;
  scopes: string[];
  historyDays: number;   // plan's max_sales_history_days (-1 = unlimited)
};

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf  = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extraHeaders },
  });
}

function clamp(val: number | null, max: number, fallback: number) {
  const n = Number(val);
  const effective = (isNaN(n) || n <= 0) ? fallback : n;
  return Math.min(effective, max);
}

// 1-minute fixed window, floored to the minute so all requests in the
// same 60s slice share a bucket.
function currentWindowStart(): string {
  const ms = Date.now();
  const flooredMs = Math.floor(ms / 60000) * 60000;
  return new Date(flooredMs).toISOString();
}

// STEP 30e helpers ──────────────────────────────────────────────────────
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// A database error: known codes become a clear 4xx; anything else is logged
// (code and message only — never the request) and answered with a plain 500.
function dbError(err: { code?: string; message?: string }, context: string) {
  const status = DB_ERROR_STATUS[err.code ?? ""];
  if (status) {
    const message = err.code === "23505"
      ? "An id in this request is already in use — send new ids for new records"
      : (err.message ?? "Request refused");
    return json({ error: message }, status);
  }
  console.error(`[api-gateway] ${context} failed`, err.code, err.message);
  return json({ error: "Internal server error" }, 500);
}

// Result of api_record_sale / api_record_register_entries
// deno-lint-ignore no-explicit-any
function writeResult(r: any) {
  if (r && r.ok === true) {
    const { ok: _ok, ...data } = r;
    return json({ data }, data.status === "already_recorded" ? 200 : 201);
  }
  // The pharmacist's PIN was refused: nothing was recorded.
  // deno-lint-ignore no-explicit-any
  const { ok: _ok, error: _error, message, reason, ...rest } = (r ?? {}) as any;
  const status = reason === "locked" ? 423 : reason === "format" ? 400 : 403;
  const headers: Record<string, string> =
    reason === "locked" && rest.minutes ? { "Retry-After": String(Number(rest.minutes) * 60) } : {};
  return json({ error: message ?? "The pharmacist's PIN was not accepted", code: reason ?? "pin_refused", ...rest }, status, headers);
}

// ?since= must be a real date/time; returns an ISO string, null, or "invalid"
function readSince(url: URL): string | null | "invalid" {
  const raw = url.searchParams.get("since");
  if (raw === null || raw.trim() === "") return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? "invalid" : new Date(t).toISOString();
}

// Today's date in Lagos as YYYY-MM-DD (the app shows expiry by the local date)
function lagosToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LAGOS_TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date());
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Reads every row of a query, page by page (the database returns at most
// PAGE_SIZE rows per request). Used by the totals in /reports and the
// disposal report so large pharmacies are not silently cut off.
// deno-lint-ignore no-explicit-any
async function selectAll(build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>) {
  // deno-lint-ignore no-explicit-any
  const rows: any[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return { rows, error: null };
  }
  return { rows, error: { code: "too_many_rows", message: `more than ${PAGE_SIZE * MAX_PAGES} rows` } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  try {
    const url            = new URL(req.url);
    const segments       = url.pathname.split("/").filter(Boolean);
    const lastSegment    = segments[segments.length - 1];
    const secondLast     = segments.length >= 2 ? segments[segments.length - 2] : undefined;
    const method         = req.method;

    // /inventory/bulk is a distinct route from /inventory — resolved here
    // so every downstream gate (scope, dispatch) treats it consistently.
    const isBulkInventory = lastSegment === "bulk" && secondLast === "inventory";
    const resource         = isBulkInventory ? "inventory_bulk" : lastSegment;

    if (!lastSegment) return json({ error: "No resource specified in path" }, 400);

    // ── 1. Extract Bearer key ────────────────────────────────────────────
    const auth   = req.headers.get("Authorization") ?? "";
    const rawKey = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!rawKey) return json({ error: "Missing API key. Use 'Authorization: Bearer <key>'." }, 401);

    // ── 2. Resolve key record (org_id comes from HERE only) ──────────────
    const keyHash = await sha256Hex(rawKey);
    const { data: keyRow, error: keyErr } = await admin
      .from("api_keys")
      .select("id, org_id, scopes, is_active, revoked_at, rate_limit_per_minute")
      .eq("key_hash", keyHash)
      .maybeSingle();

    if (keyErr) {
      console.error("[api-gateway] key lookup error", keyErr);
      return json({ error: "Internal error validating key" }, 500);
    }
    if (!keyRow || !keyRow.is_active || keyRow.revoked_at) {
      return json({ error: "Invalid or revoked API key" }, 401);
    }

    const orgId: string           = keyRow.org_id;
    const grantedScopes: string[] = keyRow.scopes ?? [];
    const rateLimit: number       = keyRow.rate_limit_per_minute ?? 60;

    // ── 3. Rate limit gate — atomic increment in Postgres ─────────────────
    // Checked before org/tier lookups so an over-limit caller doesn't
    // also cost us two extra DB round trips per rejected request.
    const windowStart = currentWindowStart();
    const { data: requestCount, error: rlErr } = await admin.rpc(
      "increment_api_rate_limit",
      { p_key_id: keyRow.id, p_window_start: windowStart }
    );

    if (rlErr) {
      // Fail OPEN on infra errors — a broken rate limiter should not take
      // down the whole API. Log it so it's visible, but let the request through.
      console.error("[api-gateway] rate limit check failed", rlErr);
    } else if (typeof requestCount === "number" && requestCount > rateLimit) {
      return json(
        { error: `Rate limit exceeded. Max ${rateLimit} requests/minute for this key.` },
        429,
        { "Retry-After": "60", "X-RateLimit-Limit": String(rateLimit), "X-RateLimit-Remaining": "0" }
      );
    }

    const rateLimitHeaders = typeof requestCount === "number"
      ? {
          "X-RateLimit-Limit": String(rateLimit),
          "X-RateLimit-Remaining": String(Math.max(0, rateLimit - requestCount)),
        }
      : {};

    // ── 4. Resolve org ──────────────────────────────────────────────────
    const { data: orgRow, error: orgErr } = await admin
      .from("organizations")
      .select("subscription_tier, api_access_enabled, api_monthly_quota")
      .eq("id", orgId)
      .maybeSingle();

    if (orgErr || !orgRow) {
      return json({ error: "Could not verify organization" }, 500);
    }

    // ── 4a. Org gate ────────────────────────────────────────────────────
    if (!orgRow.api_access_enabled) {
      return json({
        error: "API access has not been enabled for this organization. Contact PharmaGuard NG support.",
      }, 403);
    }

    // ── 4b. Tier gate ───────────────────────────────────────────────────
    const { data: planRow, error: planErr } = await admin
      .from("plan_config")
      .select("can_api_access, can_disposal_report, can_poisons_register, can_reports, can_audit_trail, max_sales_history_days")
      .eq("tier", orgRow.subscription_tier)
      .maybeSingle();

    if (planErr || !planRow) {
      return json({ error: "Could not verify plan configuration" }, 500);
    }

    if (!planRow.can_api_access) {
      return json({ error: "API access is not available on your current plan." }, 403);
    }

    // STEP 30e: the plan must include the feature this route uses
    const feature = PLAN_FEATURES[resource];
    // deno-lint-ignore no-explicit-any
    if (feature && !(planRow as any)[feature.flag]) {
      return json({ error: `${feature.label} is not included in your current plan.` }, 403);
    }
    const historyDays = Number(planRow.max_sales_history_days ?? 0);
    if (resource === "sales_history" && historyDays === 0) {
      return json({ error: "Sales history is not included in your current plan." }, 403);
    }

    // ── 4c. Monthly quota gate — billing, separate from the per-minute
    //        rate limit above. Counts every request that reaches this
    //        point (org authorized, tier valid) regardless of whether the
    //        scope check below ultimately allows or rejects it — the org
    //        made an authorized call against their account either way.
    const monthStart = new Date().toISOString().slice(0, 7) + "-01"; // YYYY-MM-01
    const monthlyQuota: number = orgRow.api_monthly_quota ?? 500;
    const { data: usageCount, error: usageErr } = await admin.rpc(
      "increment_api_client_usage",
      { p_org_id: orgId, p_month_start: monthStart }
    );

    if (usageErr) {
      // Fail OPEN, same policy as the rate limiter — a broken quota
      // counter should not take down the API. Logged for visibility.
      console.error("[api-gateway] quota check failed", usageErr);
    } else if (typeof usageCount === "number" && usageCount > monthlyQuota) {
      return json({
        error: `Monthly request quota exceeded (${monthlyQuota}/month). Contact PharmaGuard NG to increase your limit.`,
      }, 402);
    }

    // ── 5. Scope gate ───────────────────────────────────────────────────
    const routeKey      = `${resource}:${method}`;
    const requiredScope = ROUTE_SCOPES[routeKey];

    if (!requiredScope) return json({ error: `No route for ${method} /${resource}` }, 404);
    if (!grantedScopes.includes(requiredScope)) {
      return json({ error: `Forbidden. Key lacks required scope: ${requiredScope}` }, 403);
    }

    // ── 6. Update last_used_at — fire and forget ─────────────────────────
    admin
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", keyRow.id)
      .then(() => {}, (e: unknown) => console.error("[api-gateway] last_used_at update failed", e));

    // ── 7. Parse body ────────────────────────────────────────────────────
    // STEP 30e: invalid JSON is refused instead of being treated as {}.
    // deno-lint-ignore no-explicit-any
    let body: any = null;
    if (method !== "GET") {
      const text = await req.text();
      if (text.length > MAX_BODY_CHARS) return json({ error: "The request body is too large" }, 413);
      if (text.trim() === "") {
        body = {};
      } else {
        try {
          body = JSON.parse(text);
        } catch {
          return json({ error: "The request body is not valid JSON" }, 400);
        }
      }
    }

    const ctx: Ctx = { orgId, keyId: keyRow.id, scopes: grantedScopes, historyDays };

    // ── 8. Dispatch ──────────────────────────────────────────────────────
    let response: Response;
    switch (resource) {
      case "inventory":        response = await handleInventory(method, ctx, url, body); break;
      case "inventory_bulk":   response = await handleInventoryBulk(ctx, body); break;
      case "sales":            response = await handleSalesWrite(ctx, body); break;
      case "sales_history":    response = await handleSalesHistory(ctx, url); break;
      case "poison_register":  response = await handlePoisonRegister(method, ctx, url, body); break;
      case "disposal_report":  response = await handleDisposalReport(ctx, url); break;
      case "reports":          response = await handleReports(ctx, url); break;
      case "audit_trail":      response = await handleAuditTrail(ctx, url); break;
      default:                 return json({ error: "Unknown resource" }, 404);
    }

    // Attach rate limit headers to the successful response too
    for (const [k, v] of Object.entries(rateLimitHeaders)) {
      response.headers.set(k, v);
    }
    return response;

  } catch (err) {
    console.error("[api-gateway] unhandled error", err instanceof Error ? err.message : "unknown");
    return json({ error: "Internal server error" }, 500);
  }
});

// =====================================================================
// Resource handlers — all columns verified against live schema (Step 30c)
// =====================================================================

// deno-lint-ignore no-explicit-any
async function handleInventory(method: string, ctx: Ctx, url: URL, body: any) {
  if (method === "GET") {
    const limit      = clamp(Number(url.searchParams.get("limit")), 500, 100);
    const page       = Math.max(Number(url.searchParams.get("page") || "1") || 1, 1);
    const from       = (page - 1) * limit;
    const to         = from + limit - 1;
    const controlled = url.searchParams.get("controlled");
    // STEP 30e: archived flag and reorder level added; cost price only with margins:read;
    // a fixed order so pages never overlap or skip products
    const margins    = ctx.scopes.includes("margins:read");

    let q = admin
      .from("products")
      .select(
        "id, name, generic, nafdac, batch, expiry, quantity, selling_price, controlled, category, neml_drug_id, reorder_level, active"
          + (margins ? ", cost_price" : ""),
        { count: "exact" },
      )
      .eq("organization_id", ctx.orgId)
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);

    if (controlled === "true")  q = q.eq("controlled", true);
    if (controlled === "false") q = q.eq("controlled", false);

    const { data, error, count } = await q;
    if (error) return dbError(error, "inventory read");
    return json({
      data,
      meta: { total: count, page, limit, pages: Math.ceil((count ?? 0) / limit) }
    });
  }

  // STEP 30e: one product, through api_create_products (owner recorded, plan
  // product limit, cost price only with margins:write, audited)
  if (method === "POST") {
    if (!isPlainObject(body)) return json({ error: "The request body must be a JSON object" }, 400);
    const { data, error } = await admin.rpc("api_create_products", {
      p_key_id: ctx.keyId, p_products: [body], p_partial: false,
    });
    if (error) return dbError(error, "create product");
    return json({ data: data.products?.[0] ?? null }, 201);
  }

  // STEP 30e: through api_update_product — "quantity_change" adds/removes stock
  // safely; "expected_quantity" refuses the change if someone else changed the
  // stock in the meantime; every change is audited
  if (method === "PATCH") {
    if (!isPlainObject(body)) return json({ error: "The request body must be a JSON object" }, 400);
    const { data, error } = await admin.rpc("api_update_product", { p_key_id: ctx.keyId, p_body: body });
    if (error) return dbError(error, "update product");
    return json({ data: data.product, meta: { quantity_before: data.quantity_before, quantity_after: data.quantity_after } });
  }

  return json({ error: "Method not allowed" }, 405);
}

// ── INVENTORY BULK ───────────────────────────────────────────────────
// POST /inventory/bulk — up to 100 products in one request.
// Partial success: rows with a problem are skipped and reported
// individually (by their position in the request); valid rows are still
// created. STEP 30e: done inside api_create_products, so the owner, the
// plan's product limit and the cost-price permission apply to every row.
// deno-lint-ignore no-explicit-any
async function handleInventoryBulk(ctx: Ctx, body: any) {
  const products = body?.products;
  if (!Array.isArray(products) || products.length === 0) {
    return json({ error: "products array is required (max 100 items)" }, 400);
  }
  if (products.length > BULK_INVENTORY_MAX) {
    return json({ error: `Max ${BULK_INVENTORY_MAX} products per bulk request. Received ${products.length}.` }, 400);
  }

  const { data, error } = await admin.rpc("api_create_products", {
    p_key_id: ctx.keyId, p_products: products, p_partial: true,
  });
  if (error) return dbError(error, "bulk create products");

  return json(
    { data: { created: data.created, products: data.products }, skipped: data.skipped },
    data.created === 0 ? 400 : 201,
  );
}

// STEP 30e: POST /sales — the sale, stock and any Poisons Register entries
// in one go (api_record_sale). Controlled lines need register details and
// the pharmacist's email + PIN; the key also needs poison_register:write.
// deno-lint-ignore no-explicit-any
async function handleSalesWrite(ctx: Ctx, body: any) {
  if (!isPlainObject(body)) return json({ error: "The request body must be a JSON object" }, 400);
  const { data, error } = await admin.rpc("api_record_sale", { p_key_id: ctx.keyId, p_body: body });
  if (error) return dbError(error, "record sale");
  return writeResult(data);
}

async function handleSalesHistory(ctx: Ctx, url: URL) {
  const limit = clamp(Number(url.searchParams.get("limit")), 200, 50);
  const since = readSince(url);
  if (since === "invalid") return json({ error: "since must be a date like 2026-11-01 or 2026-11-01T08:00:00Z" }, 400);
  // STEP 30e: profit and line costs only with margins:read; void details shown
  const margins = ctx.scopes.includes("margins:read");

  // STEP 30e: the plan's sales-history limit (days; -1 = unlimited)
  let from = since;
  if (ctx.historyDays > 0) {
    const earliest = new Date(Date.now() - ctx.historyDays * 86_400_000).toISOString();
    if (!from || from < earliest) from = earliest;
  }

  let q = admin
    .from("sales")
    .select(
      "id, total, " + (margins ? "profit, " : "")
        + "payment, cashier, customer, created_at, voided_at, void_reason, sale_items(id, product_id, name, qty, price"
        + (margins ? ", cost" : "") + ")",
    )
    .eq("organization_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (from) q = q.gte("created_at", from);

  const { data, error } = await q;
  if (error) return dbError(error, "sales history");
  return json({ data, meta: { history_days: ctx.historyDays === -1 ? "unlimited" : ctx.historyDays } });
}

// deno-lint-ignore no-explicit-any
async function handlePoisonRegister(method: string, ctx: Ctx, url: URL, body: any) {
  if (method === "GET") {
    const limit = clamp(Number(url.searchParams.get("limit")), 500, 100);
    const since = readSince(url);
    if (since === "invalid") return json({ error: "since must be a date like 2026-11-01 or 2026-11-01T08:00:00Z" }, 400);

    // STEP 30e: the authorising pharmacist, the linked sale, the client's
    // receipt number and sale time are now included
    let q = admin
      .from("controlled_dispense")
      .select("id, product_id, product_name, batch, quantity, amount, patient_name, patient_phone, prescriber, prescriber_reg_no, prescription_ref, cashier, authorized_by_name, sale_id, external_sale_ref, sold_at, at")
      .eq("organization_id", ctx.orgId)
      .order("at", { ascending: false })
      .limit(limit);

    if (since) q = q.gte("at", since);

    const { data, error } = await q;
    if (error) return dbError(error, "poisons register read");
    return json({ data });
  }

  // STEP 30e: register-only entries (the sale is in the client's own system),
  // through api_record_register_entries: each product must be in this
  // pharmacy's PharmaGuard list and marked Controlled; no stock change.
  if (method === "POST") {
    if (!isPlainObject(body)) return json({ error: "The request body must be a JSON object" }, 400);
    const { data, error } = await admin.rpc("api_record_register_entries", { p_key_id: ctx.keyId, p_body: body });
    if (error) return dbError(error, "record register entries");
    return writeResult(data);
  }

  return json({ error: "Method not allowed" }, 405);
}

// STEP 30e: the same rule as the app's NAFDAC disposal inventory — only
// EXPIRED stock still on hand (expiry before today's Lagos date, quantity
// above 0), archived products included and marked, controlled medicines
// listed separately. Near-expiry stock is still sellable and is reported in
// a separate list, never as part of the disposal inventory.
async function handleDisposalReport(ctx: Ctx, url: URL) {
  const days    = clamp(Number(url.searchParams.get("days")), 90, 30);   // near-expiry window
  const today   = lagosToday();
  const horizon = addDays(today, days);

  const { rows, error } = await selectAll((from, to) => admin
    .from("products")
    .select("id, name, generic, nafdac, manufacturer, country_of_source, batch, expiry, quantity, selling_price, category, controlled, item_type, active")
    .eq("organization_id", ctx.orgId)
    .gt("quantity", 0)
    .not("expiry", "is", null)
    .lte("expiry", horizon)
    .order("expiry", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to));
  if (error) return dbError(error, "disposal report");

  // deno-lint-ignore no-explicit-any
  const shape = (p: any) => {
    const { active, ...rest } = p;
    return {
      ...rest,
      archived: active === false,
      market_value: round2(Number(p.quantity) * Number(p.selling_price ?? 0)),
    };
  };
  const expired  = rows.filter((p) => p.expiry < today).map((p) => ({ ...shape(p), days_since_expiry: daysBetween(p.expiry, today) }));
  const nearList = rows.filter((p) => p.expiry >= today).map((p) => ({ ...shape(p), days_to_expiry: daysBetween(today, p.expiry) }));
  const general    = expired.filter((p) => !p.controlled);
  const controlled = expired.filter((p) => p.controlled);
  const sum = (list: { market_value: number }[]) => round2(list.reduce((s, p) => s + p.market_value, 0));

  return json({
    data: {
      generated_at: new Date().toISOString(),
      as_of_date: today,
      timezone: LAGOS_TZ,
      disposal_inventory: {
        rule: "Expired stock still on hand (expiry before today, quantity above 0), archived products included — the same list the app prints for a NAFDAC destruction application.",
        general,
        controlled,
        totals: {
          items: expired.length,
          quantity: expired.reduce((s, p) => s + Number(p.quantity), 0),
          market_value: sum(expired),
          general_items: general.length,
          general_value: sum(general),
          controlled_items: controlled.length,
          controlled_value: sum(controlled),
          archived_items: expired.filter((p) => p.archived).length,
          missing_batch: expired.filter((p) => !p.batch).length,
          missing_manufacturer: expired.filter((p) => !p.manufacturer).length,
        },
      },
      near_expiry: {
        rule: `Still sellable — expires within ${days} days. Not part of the disposal inventory.`,
        window_days: days,
        items: nearList.length,
        market_value: sum(nearList),
        products: nearList,
      },
    },
  });
}

// STEP 30e: voided sales are left out of the totals (and counted separately);
// profit only with margins:read; every row is read (no silent 1,000-row cut).
async function handleReports(ctx: Ctx, url: URL) {
  const maxDays = ctx.historyDays > 0 ? Math.min(90, ctx.historyDays) : 90;
  const days  = clamp(Number(url.searchParams.get("days")), maxDays, Math.min(30, maxDays));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const margins = ctx.scopes.includes("margins:read");

  const [salesRes, cdRes] = await Promise.all([
    selectAll((from, to) => admin.from("sales")
      .select("id, total, " + (margins ? "profit, " : "") + "voided_at")
      .eq("organization_id", ctx.orgId).gte("created_at", since)
      .order("id", { ascending: true }).range(from, to)),
    selectAll((from, to) => admin.from("controlled_dispense")
      .select("id, quantity")
      .eq("organization_id", ctx.orgId).gte("at", since)
      .order("id", { ascending: true }).range(from, to)),
  ]);

  if (salesRes.error) return dbError(salesRes.error, "reports (sales)");
  if (cdRes.error)    return dbError(cdRes.error, "reports (register)");

  const sales  = salesRes.rows.filter((r) => !r.voided_at);
  const voided = salesRes.rows.length - sales.length;
  const cd     = cdRes.rows;

  return json({
    data: {
      period_days:                days,
      since,
      total_revenue:              round2(sales.reduce((s, r) => s + (Number(r.total) || 0), 0)),
      ...(margins ? { total_profit: round2(sales.reduce((s, r) => s + (Number(r.profit) || 0), 0)) } : {}),
      sale_count:                 sales.length,
      voided_sale_count:          voided,
      controlled_dispense_count:  cd.length,
      controlled_units_dispensed: cd.reduce((s, r) => s + (r.quantity || 0), 0),
    },
  });
}

async function handleAuditTrail(ctx: Ctx, url: URL) {
  const limit = clamp(Number(url.searchParams.get("limit")), 500, 100);
  const since = readSince(url);
  if (since === "invalid") return json({ error: "since must be a date like 2026-11-01 or 2026-11-01T08:00:00Z" }, 400);

  let q = admin
    .from("audit_logs")
    .select("id, username, action, target, detail, at")
    .eq("organization_id", ctx.orgId)
    .order("at", { ascending: false })
    .limit(limit);

  if (since) q = q.gte("at", since);

  const { data, error } = await q;
  if (error) return dbError(error, "audit trail");
  return json({ data });
}
