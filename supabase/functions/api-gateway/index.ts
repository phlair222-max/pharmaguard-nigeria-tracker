// =====================================================================
// PharmaGuard NG — Modular API Gateway
// supabase/functions/api-gateway/index.ts
//
// SECURITY INVARIANTS:
// 1. org_id is resolved ONLY from the api_keys row — never from caller input.
// 2. Every request checks SIX gates, in order:
//    a. Key validity: is this key active and unrevoked?
//    b. Rate limit: has this key exceeded its per-minute request budget?
//       (anti-abuse — protects infra, not tied to billing)
//    c. Org gate: does this org have api_access_enabled = true?
//    d. Tier gate: does this org's subscription tier have can_api_access?
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
// 5. STEP 14 (temporary): POST /sales and POST /poison_register are
//    SWITCHED OFF (they answer 503). See the comments on those handlers.
//    All reading routes and the inventory routes are unchanged.
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

const BULK_INVENTORY_MAX = 100;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
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
      .select("can_api_access, can_disposal_report")
      .eq("tier", orgRow.subscription_tier)
      .maybeSingle();

    if (planErr || !planRow) {
      return json({ error: "Could not verify plan configuration" }, 500);
    }

    if (!planRow.can_api_access) {
      return json({ error: "API access is not available on your current plan." }, 403);
    }

    if (resource === "disposal_report" && !planRow.can_disposal_report) {
      return json({ error: "AI Disposal Report is not available on your current plan." }, 403);
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
      .then(() => {})
      .catch(e => console.error("[api-gateway] last_used_at update failed", e));

    // ── 7. Parse body ────────────────────────────────────────────────────
    const body = method !== "GET" ? await req.json().catch(() => ({})) : null;

    // ── 8. Dispatch ──────────────────────────────────────────────────────
    let response: Response;
    switch (resource) {
      case "inventory":        response = await handleInventory(method, orgId, url, body); break;
      case "inventory_bulk":   response = await handleInventoryBulk(orgId, body); break;
      case "sales":             response = await handleSalesWrite(orgId, body); break;
      case "sales_history":    response = await handleSalesHistory(orgId, url); break;
      case "poison_register":  response = await handlePoisonRegister(method, orgId, url, body); break;
      case "disposal_report":  response = await handleDisposalReport(orgId, url); break;
      case "reports":          response = await handleReports(orgId, url); break;
      case "audit_trail":      response = await handleAuditTrail(orgId, url); break;
      default:                 return json({ error: "Unknown resource" }, 404);
    }

    // Attach rate limit headers to the successful response too
    for (const [k, v] of Object.entries(rateLimitHeaders)) {
      response.headers.set(k, v);
    }
    return response;

  } catch (err) {
    console.error("[api-gateway] unhandled error", err);
    return json({ error: "Internal server error" }, 500);
  }
});

// =====================================================================
// Resource handlers — all columns verified against live schema
// =====================================================================

async function handleInventory(method: string, orgId: string, url: URL, body: any) {
  if (method === "GET") {
    const limit      = clamp(Number(url.searchParams.get("limit")), 500, 100);
    const page       = Math.max(Number(url.searchParams.get("page") || "1") || 1, 1);
    const from       = (page - 1) * limit;
    const to         = from + limit - 1;
    const controlled = url.searchParams.get("controlled");

    let q = admin
      .from("products")
      .select("id, name, generic, nafdac, batch, expiry, quantity, selling_price, controlled, category, neml_drug_id", { count: "exact" })
      .eq("organization_id", orgId)
      .range(from, to);

    if (controlled === "true")  q = q.eq("controlled", true);
    if (controlled === "false") q = q.eq("controlled", false);

    const { data, error, count } = await q;
    if (error) return json({ error: error.message }, 500);
    return json({
      data,
      meta: { total: count, page, limit, pages: Math.ceil((count ?? 0) / limit) }
    });
  }

  if (method === "POST") {
    const { name, quantity, selling_price, controlled, category, neml_drug_id } = body ?? {};
    if (!name || quantity == null || selling_price == null) {
      return json({ error: "name, quantity, selling_price are required" }, 400);
    }

    // products.user_id is NOT NULL but API clients have no user of their
    // own — use the org's owner_id (the nominal platform-admin owner for
    // API-only orgs) so callers never need to know this column exists.
    const { data: ownerRow, error: ownerErr } = await admin
      .from("organizations")
      .select("owner_id")
      .eq("id", orgId)
      .maybeSingle();

    if (ownerErr || !ownerRow) {
      return json({ error: "Could not resolve organization owner" }, 500);
    }

    const { data, error } = await admin
      .from("products")
      .insert({
        organization_id: orgId,
        user_id: ownerRow.owner_id,
        name, quantity, selling_price,
        controlled: controlled ?? false,
        category:   category   ?? null,
        neml_drug_id: neml_drug_id ?? null,
        item_type: "pharmaceutical",
      })
      .select()
      .single();

    if (error) return json({ error: error.message }, 500);
    return json({ data }, 201);
  }

  if (method === "PATCH") {
    const { id, ...updates } = body ?? {};
    if (!id) return json({ error: "id is required" }, 400);

    const allowed = ["quantity", "selling_price", "batch", "expiry", "reorder_level"];
    const safe = Object.fromEntries(
      Object.entries(updates).filter(([k]) => allowed.includes(k))
    );
    if (Object.keys(safe).length === 0) {
      return json({ error: `No updatable fields. Allowed: ${allowed.join(", ")}` }, 400);
    }

    const { data, error } = await admin
      .from("products")
      .update(safe)
      .eq("id", id)
      .eq("organization_id", orgId)
      .select()
      .single();

    if (error) return json({ error: error.message }, 500);
    return json({ data });
  }

  return json({ error: "Method not allowed" }, 405);
}

// ── INVENTORY BULK ───────────────────────────────────────────────────
// POST /inventory/bulk — up to 100 products in one request.
// Partial success: rows missing required fields are skipped and
// reported individually; valid rows are still created. If the batch
// insert itself fails (rare — e.g. a DB constraint), falls back to
// inserting one at a time so the caller still learns which rows failed.
async function handleInventoryBulk(orgId: string, body: any) {
  const products = body?.products;
  if (!Array.isArray(products) || products.length === 0) {
    return json({ error: "products array is required (max 100 items)" }, 400);
  }
  if (products.length > BULK_INVENTORY_MAX) {
    return json({ error: `Max ${BULK_INVENTORY_MAX} products per bulk request. Received ${products.length}.` }, 400);
  }

  // products.user_id is NOT NULL — resolve the org's owner once, reuse
  // for every row, same fix as the single-item POST /inventory handler.
  const { data: ownerRow, error: ownerErr } = await admin
    .from("organizations")
    .select("owner_id")
    .eq("id", orgId)
    .maybeSingle();

  if (ownerErr || !ownerRow) {
    return json({ error: "Could not resolve organization owner" }, 500);
  }

  const skipped: { index: number; error: string }[] = [];
  // Each entry keeps its ORIGINAL position in the caller's products array,
  // so error reporting always refers to the row the caller actually sent —
  // even after invalid rows are filtered out or a fallback path runs.
  const validRows: { originalIndex: number; row: any }[] = [];

  products.forEach((p: any, originalIndex: number) => {
    const { name, quantity, selling_price, controlled, category, neml_drug_id } = p ?? {};
    if (!name || quantity == null || selling_price == null) {
      skipped.push({ index: originalIndex, error: "name, quantity, selling_price are required" });
      return;
    }
    validRows.push({
      originalIndex,
      row: {
        organization_id: orgId,
        user_id: ownerRow.owner_id,
        name, quantity, selling_price,
        controlled: controlled ?? false,
        category:   category   ?? null,
        neml_drug_id: neml_drug_id ?? null,
        item_type: "pharmaceutical",
      },
    });
  });

  if (validRows.length === 0) {
    return json({ data: { created: 0, products: [] }, skipped }, 400);
  }

  // Try one batch insert first — fastest path when all rows are clean.
  const batchResult = await admin.from("products").insert(validRows.map(v => v.row)).select();

  if (!batchResult.error) {
    return json({
      data: { created: batchResult.data.length, products: batchResult.data },
      skipped,
    }, 201);
  }

  // Batch failed (e.g. one row hit a DB constraint) — fall back to
  // inserting one at a time so we can identify exactly which row(s)
  // failed instead of losing the whole batch.
  console.error("[api-gateway] bulk batch insert failed, falling back to per-row", batchResult.error);
  const created: any[] = [];
  for (const { originalIndex, row } of validRows) {
    const { data, error } = await admin.from("products").insert(row).select().single();
    if (error) {
      skipped.push({ index: originalIndex, error: error.message });
    } else {
      created.push(data);
    }
  }

  return json({ data: { created: created.length, products: created }, skipped }, 201);
}

// STEP 14 (temporary): recording sales through the API is SWITCHED OFF.
// The previous version saved the sale and its items in two separate
// writes (if the second failed, an empty sale was left behind that can
// never be deleted, because sales are permanent records), did not reduce
// stock, did not check that the products belong to this organization,
// recorded no seller and no profit, and trusted any cost/price sent.
// It will return when it uses the same server-side sale function as the
// pharmacy app (Step 14c).
async function handleSalesWrite(_orgId: string, _body: any) {
  return json({
    error: "Recording sales through the API is temporarily unavailable. Contact PharmaGuard NG support.",
  }, 503);
}

async function handleSalesHistory(orgId: string, url: URL) {
  const limit = clamp(Number(url.searchParams.get("limit")), 200, 50);
  const since = url.searchParams.get("since");

  let q = admin
    .from("sales")
    .select("id, total, profit, payment, cashier, customer, created_at, sale_items(id, product_id, name, qty, price)")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (since) q = q.gte("created_at", since);

  const { data, error } = await q;
  if (error) return json({ error: error.message }, 500);
  return json({ data });
}

async function handlePoisonRegister(method: string, orgId: string, url: URL, body: any) {
  if (method === "GET") {
    const limit = clamp(Number(url.searchParams.get("limit")), 500, 100);
    const since = url.searchParams.get("since");

    let q = admin
      .from("controlled_dispense")
      .select("id, product_name, batch, quantity, amount, patient_name, patient_phone, prescriber, prescriber_reg_no, prescription_ref, cashier, at")
      .eq("organization_id", orgId)
      .order("at", { ascending: false })
      .limit(limit);

    if (since) q = q.gte("at", since);

    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);
    return json({ data });
  }

  // STEP 14 (temporary): writing to the Poisons Register through the API
  // is SWITCHED OFF. The previous version did not check that the product
  // belongs to this organization, did not reduce stock, and recorded no
  // responsible user — not acceptable for a regulated register. It will
  // return when it uses the same server-side function as the app.
  if (method === "POST") {
    return json({
      error: "Recording Poisons Register entries through the API is temporarily unavailable. Contact PharmaGuard NG support.",
    }, 503);
  }

  return json({ error: "Method not allowed" }, 405);
}

async function handleDisposalReport(orgId: string, url: URL) {
  const days  = clamp(Number(url.searchParams.get("days")), 90, 30);
  const cutoff = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const { data, error } = await admin
    .from("products")
    .select("id, name, generic, nafdac, batch, expiry, quantity, selling_price, category, controlled")
    .eq("organization_id", orgId)
    .lte("expiry", cutoff)
    .gt("quantity", 0)
    .order("expiry", { ascending: true });

  if (error) return json({ error: error.message }, 500);

  const products = data ?? [];
  const totalEstimatedLoss = products.reduce(
    (sum, p) => sum + (p.quantity * Number(p.selling_price)), 0
  );

  return json({
    data: {
      generated_at: new Date().toISOString(),
      expiry_window_days: days,
      product_count: products.length,
      total_estimated_loss_ngn: totalEstimatedLoss,
      products,
    },
  });
}

async function handleReports(orgId: string, url: URL) {
  const days  = clamp(Number(url.searchParams.get("days")), 90, 30);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [salesRes, cdRes] = await Promise.all([
    admin.from("sales").select("total, profit, created_at").eq("organization_id", orgId).gte("created_at", since),
    admin.from("controlled_dispense").select("quantity, amount, at").eq("organization_id", orgId).gte("at", since),
  ]);

  if (salesRes.error) return json({ error: salesRes.error.message }, 500);
  if (cdRes.error)    return json({ error: cdRes.error.message },    500);

  const sales = salesRes.data ?? [];
  const cd    = cdRes.data   ?? [];

  return json({
    data: {
      period_days:                days,
      since,
      total_revenue:              sales.reduce((s, r) => s + (Number(r.total)  || 0), 0),
      total_profit:               sales.reduce((s, r) => s + (Number(r.profit) || 0), 0),
      sale_count:                 sales.length,
      controlled_dispense_count:  cd.length,
      controlled_units_dispensed: cd.reduce((s, r) => s + (r.quantity || 0), 0),
    },
  });
}

async function handleAuditTrail(orgId: string, url: URL) {
  const limit = clamp(Number(url.searchParams.get("limit")), 500, 100);
  const since = url.searchParams.get("since");

  let q = admin
    .from("audit_logs")
    .select("id, username, action, target, detail, at")
    .eq("organization_id", orgId)
    .order("at", { ascending: false })
    .limit(limit);

  if (since) q = q.gte("at", since);

  const { data, error } = await q;
  if (error) return json({ error: error.message }, 500);
  return json({ data });
}
