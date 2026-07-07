// =====================================================================
// PharmaGuard NG — Modular API Gateway
// supabase/functions/api-gateway/index.ts
//
// SECURITY INVARIANTS:
// 1. org_id is resolved ONLY from the api_keys row — never from caller input.
// 2. Every request checks TWO gates:
//    a. Key scope gate: does this key have the required scope?
//    b. Plan gate: does this org's active plan have can_api_access = true?
//    Both must pass. Either can independently reject.
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Route table: "resource:METHOD" -> required scope
// Suppliers, Settings, AI Forecast, Platform Admin intentionally excluded.
// audit_trail write intentionally never mapped.
const ROUTE_SCOPES: Record<string, string> = {
  "inventory:GET":          "inventory:read",
  "inventory:POST":         "inventory:write",
  "inventory:PATCH":        "inventory:write",
  "sales:POST":             "sales:write",
  "sales_history:GET":      "sales_history:read",
  "poison_register:GET":    "poison_register:read",
  "poison_register:POST":   "poison_register:write",
  "disposal_report:GET":    "disposal_report:read",
  "reports:GET":            "reports:read",
  "audit_trail:GET":        "audit_trail:read",
};

// CORS headers — returned on every response including errors.
// Third-party integrators call this from their own origins, so we allow all.
// The actual security is the Bearer key + plan gate, not origin restriction.
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function clamp(val: number | null, max: number, fallback: number) {
  return Math.min(val ?? fallback, max);
}

Deno.serve(async (req) => {
  // Handle CORS preflight — must return 200 with headers, no auth check
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  try {
    const url      = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    const resource = segments[segments.length - 1];
    const method   = req.method;

    if (!resource) return json({ error: "No resource specified in path" }, 400);

    // ── 1. Extract Bearer key ────────────────────────────────────────────
    const auth   = req.headers.get("Authorization") ?? "";
    const rawKey = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!rawKey) return json({ error: "Missing API key. Use 'Authorization: Bearer <key>'." }, 401);

    // ── 2. Resolve key record (org_id comes from HERE only) ──────────────
    const keyHash = await sha256Hex(rawKey);
    const { data: keyRow, error: keyErr } = await admin
      .from("api_keys")
      .select("id, org_id, scopes, is_active, revoked_at")
      .eq("key_hash", keyHash)
      .maybeSingle();

    if (keyErr) {
      console.error("[api-gateway] key lookup error", keyErr);
      return json({ error: "Internal error validating key" }, 500);
    }
    if (!keyRow || !keyRow.is_active || keyRow.revoked_at) {
      return json({ error: "Invalid or revoked API key" }, 401);
    }

    const orgId: string        = keyRow.org_id;
    const grantedScopes: string[] = keyRow.scopes ?? [];

    // ── 3. Plan gate — org must have can_api_access = true ───────────────
    // Looks up the org's subscription tier, then checks plan_config.
    // This is the module-level gate: even a valid key is rejected if the
    // org's plan doesn't include API access.
    const { data: orgRow, error: orgErr } = await admin
      .from("organizations")
      .select("subscription_tier")
      .eq("id", orgId)
      .maybeSingle();

    if (orgErr || !orgRow) {
      return json({ error: "Could not verify organization plan" }, 500);
    }

    const { data: planRow, error: planErr } = await admin
      .from("plan_config")
      .select("can_api_access, can_disposal_report")
      .eq("tier", orgRow.subscription_tier)
      .maybeSingle();

    if (planErr || !planRow) {
      return json({ error: "Could not verify plan configuration" }, 500);
    }

    if (!planRow.can_api_access) {
      return json({
        error: "API access is not available on your current plan. Upgrade to Pro to use the Modular API.",
      }, 403);
    }

    // Special check: disposal_report endpoint also requires can_disposal_report
    if (resource === "disposal_report" && !planRow.can_disposal_report) {
      return json({
        error: "AI Disposal Report is not available on your current plan.",
      }, 403);
    }

    // ── 4. Scope gate — key must have the required scope ─────────────────
    const routeKey      = `${resource}:${method}`;
    const requiredScope = ROUTE_SCOPES[routeKey];

    if (!requiredScope) return json({ error: `No route for ${method} /${resource}` }, 404);
    if (!grantedScopes.includes(requiredScope)) {
      return json({ error: `Forbidden. Key lacks required scope: ${requiredScope}` }, 403);
    }

    // ── 5. Update last_used_at — fire and forget ─────────────────────────
    admin
      .from("api_keys")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", keyRow.id)
      .then(() => {})
      .catch(e => console.error("[api-gateway] last_used_at update failed", e));

    // ── 6. Parse body ────────────────────────────────────────────────────
    const body = method !== "GET" ? await req.json().catch(() => ({})) : null;

    // ── 7. Dispatch ──────────────────────────────────────────────────────
    switch (resource) {
      case "inventory":        return handleInventory(method, orgId, url, body);
      case "sales":            return handleSalesWrite(orgId, body);
      case "sales_history":    return handleSalesHistory(orgId, url);
      case "poison_register":  return handlePoisonRegister(method, orgId, url, body);
      case "disposal_report":  return handleDisposalReport(orgId, url);
      case "reports":          return handleReports(orgId, url);
      case "audit_trail":      return handleAuditTrail(orgId, url);
      default:                 return json({ error: "Unknown resource" }, 404);
    }

  } catch (err) {
    console.error("[api-gateway] unhandled error", err);
    return json({ error: "Internal server error" }, 500);
  }
});

// =====================================================================
// Resource handlers — all columns verified against live schema
// =====================================================================

// ── INVENTORY ────────────────────────────────────────────────────────
// Table: products
async function handleInventory(method: string, orgId: string, url: URL, body: any) {
  if (method === "GET") {
    const limit      = clamp(Number(url.searchParams.get("limit")), 500, 100);
    const controlled = url.searchParams.get("controlled");

    let q = admin
      .from("products")
      .select("id, name, generic, nafdac, batch, expiry, quantity, selling_price, controlled, category, neml_drug_id")
      .eq("organization_id", orgId)
      .limit(limit);

    if (controlled === "true")  q = q.eq("controlled", true);
    if (controlled === "false") q = q.eq("controlled", false);

    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);
    return json({ data });
  }

  if (method === "POST") {
    const { name, quantity, selling_price, controlled, category, neml_drug_id } = body ?? {};
    if (!name || quantity == null || selling_price == null) {
      return json({ error: "name, quantity, selling_price are required" }, 400);
    }
    const { data, error } = await admin
      .from("products")
      .insert({
        organization_id: orgId,
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

    // Whitelist only safe fields — caller cannot change org or controlled flag
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

// ── SALES WRITE ──────────────────────────────────────────────────────
// Tables: sales + sale_items
async function handleSalesWrite(orgId: string, body: any) {
  const { items, total, payment, cashier, customer } = body ?? {};

  if (!Array.isArray(items) || items.length === 0) {
    return json({ error: "items array required. Each item: { product_id, name, qty, price }" }, 400);
  }
  for (const it of items) {
    if (!it.product_id || !it.qty || it.price == null) {
      return json({ error: "Each item requires product_id, qty, price" }, 400);
    }
  }

  const { data: sale, error: saleErr } = await admin
    .from("sales")
    .insert({
      organization_id: orgId,
      total:   total   ?? null,
      payment: payment ?? "api",
      cashier: cashier ?? "api",
      customer: customer ?? null,
    })
    .select()
    .single();

  if (saleErr) return json({ error: saleErr.message }, 500);

  const saleItems = items.map((it: any) => ({
    sale_id:    sale.id,
    product_id: it.product_id,
    name:       it.name  ?? null,
    qty:        it.qty,
    price:      it.price,
    cost:       it.cost  ?? null,
  }));

  const { error: itemsErr } = await admin.from("sale_items").insert(saleItems);
  if (itemsErr) return json({ error: itemsErr.message }, 500);

  return json({ data: { sale_id: sale.id, item_count: saleItems.length } }, 201);
}

// ── SALES HISTORY ────────────────────────────────────────────────────
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

// ── POISON REGISTER ──────────────────────────────────────────────────
// Table: controlled_dispense (verified column names)
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

  if (method === "POST") {
    const {
      product_id, product_name, batch, quantity, amount,
      patient_name, patient_phone, prescriber, prescriber_reg_no,
      prescription_ref, cashier,
    } = body ?? {};

    if (!product_id || !quantity || !patient_name || !prescriber || !prescription_ref) {
      return json({
        error: "Required: product_id, quantity, patient_name, prescriber, prescription_ref",
      }, 400);
    }

    const { data, error } = await admin
      .from("controlled_dispense")
      .insert({
        organization_id: orgId,
        product_id,
        product_name:      product_name      ?? null,
        batch:             batch             ?? null,
        quantity,
        amount:            amount            ?? null,
        patient_name,
        patient_phone:     patient_phone     ?? null,
        prescriber,
        prescriber_reg_no: prescriber_reg_no ?? null,
        prescription_ref,
        cashier:           cashier           ?? "api",
        at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return json({ error: error.message }, 500);
    return json({ data }, 201);
  }

  return json({ error: "Method not allowed" }, 405);
}

// ── AI DISPOSAL REPORT ───────────────────────────────────────────────
// Reads products expiring within N days and returns structured data.
// Third parties get raw JSON — they render it however they want.
// The Gemini call is NOT made here; that's for the in-app UI version.
// This endpoint returns the underlying data the AI report is based on,
// which is sufficient for white-label / module-only use cases.
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

// ── REPORTS ──────────────────────────────────────────────────────────
async function handleReports(orgId: string, url: URL) {
  const days  = clamp(Number(url.searchParams.get("days")), 90, 30);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [salesRes, cdRes] = await Promise.all([
    admin
      .from("sales")
      .select("total, profit, created_at")
      .eq("organization_id", orgId)
      .gte("created_at", since),
    admin
      .from("controlled_dispense")
      .select("quantity, amount, at")
      .eq("organization_id", orgId)
      .gte("at", since),
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

// ── AUDIT TRAIL ──────────────────────────────────────────────────────
// Table: audit_logs (verified column names)
// Write intentionally never exposed.
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
