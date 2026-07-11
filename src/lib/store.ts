import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Product = {
  id: string;
  name: string;
  generic: string;
  nafdac: string;
  batch: string;
  expiry: string;
  quantity: number;
  reorderLevel: number;
  reorderQuantity: number;
  packSize: string;
  lastRestocked?: string;
  costPrice: number | null;
  sellingPrice: number;
  supplier: string;
  supplierId?: string;
  category: string;
  description?: string;
  controlled?: boolean;
  barcode?: string;
  nemlDrugId?: string;
  itemType?: "pharmaceutical" | "non_pharmaceutical";
};

export type SaleItem = { productId: string; name: string; qty: number; price: number; cost?: number };
export type Sale = {
  id: string;
  items: SaleItem[];
  total: number;
  profit: number;
  payment: "Cash" | "POS" | "Bank Transfer" | "Mobile Money";
  cashier: string;
  customer?: string;
  createdAt: string;
  // FIX (offline support): "pending" means this sale exists locally and
  // has NOT yet been confirmed saved to Supabase — it will keep retrying
  // in the background via syncPendingSales(). "synced" means Supabase has
  // confirmed the write. Sales loaded directly from Supabase are always
  // "synced" by definition. Missing/undefined is treated as "synced" for
  // backward compatibility with sales recorded before this field existed.
  syncStatus?: "synced" | "pending";
};

export type AuditEntry = {
  id: string;
  user: string;
  action: string;
  target: string;
  detail?: string;
  at: string;
};

export type User = {
  username: string;
  // FIX: role is not guaranteed to be set the instant a session resolves.
  // For a genuinely new/unverified session it stays undefined (fail-closed)
  // until hydrateFromSupabase() confirms the real membership row. For a
  // RETURNING session (same user as last time, on this device), setAuthUser
  // bridges in the last confirmed role immediately so the app stays usable
  // offline — hydrateFromSupabase then silently re-confirms/corrects it
  // once a connection is available. See setAuthUser() for details.
  role?: "Admin" | "Pharmacist";
  organizationId?: string;
  memberRole?: "Owner" | "Pharmacist" | "Cashier";
  canViewMargins?: boolean;
  subscriptionTier?: string;
  subscriptionExpiresAt?: string | null;
  // FIX: surfaces recurring-billing state so the UI can show a grace-period
  // warning and days-remaining before an automatic downgrade to Free.
  billingStatus?: "active" | "grace_period";
  gracePeriodStartedAt?: string | null;
};

export type PlanConfig = {
  tier: string;
  displayName: string;
  priceMonthly: number;
  maxProducts: number;          // -1 = unlimited
  maxStaff: number;             // -1 = unlimited
  maxSalesHistoryDays: number;  // -1 = unlimited
  canAiForecast: boolean;
  canPoisonsRegister: boolean;
  canReports: boolean;
  canSuppliers: boolean;
  canAuditTrail: boolean;
  canApiAccess: boolean;
  canDisposalReport: boolean;
};

export type ControlledDispense = {
  id: string;
  productId: string;
  productName: string;
  batch: string;
  quantity: number;
  amount: number;
  patientName: string;
  patientPhone?: string;
  prescriber: string;
  prescriberRegNo?: string;
  prescriptionRef: string;
  cashier: string;
  at: string;
};

export type LoginActivity = {
  id: string;
  username: string;
  at: string;
  device: string;
  status: "success" | "failed";
};

export type Credential = { username: string; passwordHash: string };

export type Supplier = {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
};

export type PharmacySettings = {
  name: string;
  address: string;
  phone: string;
  email?: string;
  premiseLicense?: string;
  logo?: string;
  ownerPhoto?: string;
  ownerName?: string;
  vatEnabled?: boolean;
  vatRate?: number;
};

type DB = {
  products: Product[];
  sales: Sale[];
  audit: AuditEntry[];
  user: User | null;
  suppliers: Supplier[];
  settings: PharmacySettings;
  controlledDispense: ControlledDispense[];
  loginActivity: LoginActivity[];
  credentials: Credential[];
  plan: PlanConfig | null;
  extendedSalesLoaded: boolean;
  // FIX: true once we have a role we're willing to act on — either freshly
  // confirmed by hydrateFromSupabase(), or bridged in from a returning
  // session's last confirmed state (see setAuthUser). RouteGuard should
  // show a neutral loading state while this is false, rather than either
  // granting or denying access based on incomplete information.
  authReady: boolean;
  // FIX: best-effort connectivity flag, updated by the browser's
  // online/offline events. Not a perfect signal (a device can report
  // "online" while actually having no usable connection), but useful for
  // UI messaging. The real source of truth for "did this request actually
  // reach Supabase" is always the try/catch around the request itself.
  isOffline: boolean;
};

const KEY = "pharmaguard_db_v3";
const ADMIN_EMAIL = "phlair222@gmail.com";

// ── PERFORMANCE FIX (Session 8) ──────────────────────────────────────────────
const SALES_HYDRATE_DAYS = 90;
function salesCutoffISO(): string {
  return new Date(Date.now() - SALES_HYDRATE_DAYS * 86400000).toISOString();
}

// FIX (offline support): wraps a Supabase call with a hard timeout. On weak
// connections common on Nigerian mobile networks, a request can hang for a
// long time without ever technically erroring out. Without this, a cashier
// on a bad connection would see "Saving sale..." indefinitely. If the
// timeout fires, the promise rejects and the caller's catch block treats it
// exactly like a network failure — the sale is queued for background sync
// instead of blocking the till.
const SALE_WRITE_TIMEOUT_MS = 8000;
function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Request timed out — weak or no connection")), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// FIX (offline support): best-effort classifier for "this failed because
// we couldn't reach the server" vs "this failed because the server
// rejected it". A thrown exception (network down, DNS failure, our own
// timeout above) is always treated as network-related. A structured
// {error} object returned BY Supabase (e.g. an RLS rejection, a constraint
// violation) means the request did reach the server and got a real
// answer — that should not be silently queued and retried forever, since
// retrying an intrinsically-rejected write will never succeed.
function isNetworkErrorMessage(msg: string | undefined | null): boolean {
  if (!msg) return true;
  return /fetch|network|timed out|timeout|offline|ENOTFOUND|Failed to fetch/i.test(msg);
}

const seedProducts: Array<[string, string, string, string, number, number, number, number, string, string, string]> = [
  ["Paracetamol 500mg", "Paracetamol", "A4-1234", "PCM-2024-001", 240, 60, 8, 15, "Emzor", "Analgesics", "Tablet"],
  ["Amoxicillin 500mg", "Amoxicillin", "A4-2210", "AMX-2024-014", 35, 30, 35, 60, "Fidson", "Antibiotics", "Capsule"],
  ["Coartem 80/480", "Artemether/Lumefantrine", "A4-9911", "CRT-2024-007", 18, 20, 950, 1500, "Novartis", "Antimalarials", "Pack of 6"],
  ["Lonart DS", "Artemether/Lumefantrine", "A4-7765", "LNT-2023-118", 12, 15, 850, 1300, "Greenlife", "Antimalarials", "Pack of 6"],
  ["Flagyl 200mg", "Metronidazole", "A4-3321", "MTZ-2024-022", 80, 40, 12, 25, "May & Baker", "Antibiotics", "Tablet"],
  ["Vitamin C 1000mg", "Ascorbic Acid", "A4-1188", "VTC-2024-090", 150, 50, 80, 150, "Emzor", "Vitamins", "Tablet"],
  ["Lopinavir/Ritonavir", "Lopinavir/Ritonavir", "A4-5544", "ARV-2024-005", 6, 10, 4500, 7000, "Mylan", "Antiretrovirals", "Bottle 60s"],
  ["Postinor 2", "Levonorgestrel", "A4-2299", "PST-2023-034", 22, 12, 800, 1500, "Gedeon Richter", "Contraceptives", "Pack of 2"],
  ["Glucophage 500mg", "Metformin", "A4-7012", "MTF-2024-019", 90, 30, 20, 40, "Merck", "Antidiabetics", "Tablet"],
  ["Amlodipine 10mg", "Amlodipine", "A4-3387", "AML-2024-031", 65, 25, 25, 55, "Fidson", "Cardiovascular", "Tablet"],
  ["Codeine Linctus", "Codeine", "A4-9001", "CDN-2024-002", 8, 10, 1200, 2000, "GSK", "Controlled Substances", "100ml"],
  ["Tramadol 50mg", "Tramadol", "A4-9002", "TRM-2024-003", 14, 10, 30, 70, "Fidson", "Controlled Substances", "Capsule"],
];

const defaultSettings: PharmacySettings = {
  name: "PharmaGuard NG Pharmacy",
  address: "12 Allen Avenue, Ikeja, Lagos",
  phone: "+234 800 742 762",
  email: "info@pharmaguard.ng",
  premiseLicense: "PCN/LAG/RP/12345",
  vatEnabled: false,
  vatRate: 7.5,
};

function makeSeed(): DB {
  const today = Date.now();
  const dayOff = (d: number) => new Date(today + d * 86400000).toISOString().slice(0, 10);
  const exps = [400, 20, 75, -10, 300, 500, 45, 25, 600, 200, 80, 15];
  const products: Product[] = seedProducts.map((p, i) => ({
    id: crypto.randomUUID(),
    name: p[0], generic: p[1], nafdac: p[2], batch: p[3],
    quantity: p[4] as number, reorderLevel: p[5] as number,
    reorderQuantity: (p[5] as number) * 3,
    costPrice: p[6] as number, sellingPrice: p[7] as number,
    supplier: p[8], category: p[9], packSize: p[10],
    expiry: dayOff(exps[i]),
    lastRestocked: dayOff(-Math.floor(Math.random() * 30)),
    controlled: p[9] === "Controlled Substances",
    description: "",
  }));

  const suppliers: Supplier[] = Array.from(new Set(products.map((p) => p.supplier))).map((name) => ({
    id: crypto.randomUUID(),
    name,
    contactPerson: "Sales Rep",
    phone: "+234 80" + Math.floor(10000000 + Math.random() * 89999999),
    email: name.toLowerCase().replace(/[^a-z]/g, "") + "@supplier.ng",
    address: "Lagos, Nigeria",
  }));
  products.forEach((p) => { p.supplierId = suppliers.find((s) => s.name === p.supplier)?.id; });

  const sales: Sale[] = [];
  for (let d = 6; d >= 0; d--) {
    const count = 3 + Math.floor(Math.random() * 5);
    for (let s = 0; s < count; s++) {
      const itemCount = 1 + Math.floor(Math.random() * 3);
      const items: SaleItem[] = [];
      let total = 0, profit = 0;
      for (let k = 0; k < itemCount; k++) {
        const p = products[Math.floor(Math.random() * products.length)];
        const qty = 1 + Math.floor(Math.random() * 3);
        items.push({ productId: p.id, name: p.name, qty, price: p.sellingPrice, cost: p.costPrice });
        total += qty * p.sellingPrice;
        profit += qty * (p.sellingPrice - p.costPrice);
      }
      sales.push({
        id: crypto.randomUUID(),
        items, total, profit,
        payment: (["Cash", "POS", "Bank Transfer", "Mobile Money"] as const)[Math.floor(Math.random() * 4)],
        cashier: "admin",
        createdAt: new Date(today - d * 86400000 - Math.random() * 80000000).toISOString(),
        syncStatus: "synced",
      });
    }
  }
  return {
    products, sales, audit: [], user: null, suppliers, settings: defaultSettings,
    controlledDispense: [], loginActivity: [], extendedSalesLoaded: false, plan: null,
    authReady: false,
    isOffline: typeof navigator !== "undefined" ? !navigator.onLine : false,
    credentials: [
      { username: "admin", passwordHash: hashPwd("admin") },
      { username: "pharma", passwordHash: hashPwd("pharma") },
    ],
  };
}

function emptyDb(): DB {
  return {
    products: [], sales: [], audit: [], user: null, suppliers: [], settings: defaultSettings, plan: null,
    extendedSalesLoaded: false,
    authReady: false,
    isOffline: typeof navigator !== "undefined" ? !navigator.onLine : false,
    controlledDispense: [], loginActivity: [],
    credentials: [
      { username: "admin", passwordHash: hashPwd("admin") },
      { username: "pharma", passwordHash: hashPwd("pharma") },
    ],
  };
}

function hashPwd(p: string): string {
  let h = 5381;
  for (let i = 0; i < p.length; i++) h = ((h << 5) + h) ^ p.charCodeAt(i);
  return "h_" + (h >>> 0).toString(16);
}

function load(): DB {
  if (typeof window === "undefined") return emptyDb();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const empty = emptyDb();
      localStorage.setItem(KEY, JSON.stringify(empty));
      return empty;
    }
    const parsed = JSON.parse(raw) as DB;
    parsed.suppliers = parsed.suppliers || [];
    parsed.settings = parsed.settings || defaultSettings;
    if (parsed.settings.vatEnabled === undefined) parsed.settings.vatEnabled = false;
    if (parsed.settings.vatRate === undefined) parsed.settings.vatRate = 7.5;
    parsed.controlledDispense = parsed.controlledDispense || [];
    parsed.loginActivity = parsed.loginActivity || [];
    parsed.credentials = parsed.credentials || [];
    parsed.extendedSalesLoaded = parsed.extendedSalesLoaded || false;
    // FIX (offline support): sales recorded before this update have no
    // syncStatus. We assume they're already synced rather than re-pushing
    // them blindly (we can't safely tell whether they already exist
    // server-side, and re-inserting could create duplicates). Any sale
    // that was truly lost by the old bug, before this fix shipped, is not
    // auto-recovered by this migration — that's a one-time historical gap,
    // not an ongoing one.
    parsed.sales = (parsed.sales || []).map((s) => ({ ...s, syncStatus: s.syncStatus ?? "synced" }));
    // FIX: authReady always starts false on a fresh page load and must be
    // earned again via setAuthUser()/hydrateFromSupabase() — but we
    // deliberately KEEP the persisted user.role/memberRole (unlike an
    // earlier version of this fix, which stripped them). Wiping them here
    // would defeat offline bootstrapping: setAuthUser() below is what
    // decides whether a cached role can be trusted, based on whether this
    // is the SAME user as last time. See setAuthUser() for the actual
    // security boundary.
    parsed.authReady = false;
    parsed.isOffline = typeof navigator !== "undefined" ? !navigator.onLine : false;
    return parsed;
  } catch {
    return emptyDb();
  }
}

let db: DB = load();
const listeners = new Set<() => void>();

function persist() {
  localStorage.setItem(KEY, JSON.stringify(db));
  listeners.forEach((l) => l());
}

function notify() {
  listeners.forEach((l) => l());
}

export const store = {
  get: () => db,
  subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); },
  reset() { localStorage.removeItem(KEY); db = load(); persist(); },

  addProduct(p: Omit<Product, "id">) {
    const np = { ...p, id: crypto.randomUUID() };
    db.products.push(np);
    this.audit("Added product", np.name);
    persist();
    void supabasePush.insertProduct(np);
    return np;
  },
  updateProduct(id: string, patch: Partial<Product>) {
    db.products = db.products.map((p) => (p ? p.id === id ? { ...p, ...patch } : p : p));
    const p = db.products.find((p) => p.id === id);
    if (p) this.audit("Updated product", p.name);
    persist();
    void supabasePush.updateProduct(id, patch);
  },
  deleteProduct(id: string) {
    const p = db.products.find((p) => p.id === id);
    db.products = db.products.filter((p) => p.id !== id);
    if (p) this.audit("Deleted product", p.name);
    persist();
    void supabasePush.deleteProduct(id);
  },
  receiveStock(id: string, qty: number) {
    const p = db.products.find((p) => p.id === id);
    if (!p) return;
    p.quantity += qty;
    p.lastRestocked = new Date().toISOString().slice(0, 10);
    this.audit("Received stock", p.name, `+${qty}`);
    persist();
    void supabasePush.updateProduct(id, { quantity: p.quantity, lastRestocked: p.lastRestocked });
  },
  adjustStock(id: string, qty: number, reason: string) {
    const p = db.products.find((p) => p.id === id);
    if (!p) return;
    p.quantity = Math.max(0, p.quantity + qty);
    this.audit("Stock adjustment", p.name, `${qty >= 0 ? "+" : ""}${qty} (${reason})`);
    persist();
    void supabasePush.updateProduct(id, { quantity: p.quantity });
  },

  // FIX (offline support — this is the core of the offline promise):
  //
  // The sale is written to local state and persisted FIRST, unconditionally,
  // so the cashier is never blocked by connectivity. It's marked
  // syncStatus: "pending". We then attempt the Supabase write:
  //
  //   • Write succeeds            → marked "synced". Done.
  //   • Write fails, network-y    → stays "pending" locally. Stock is
  //                                  already deducted, receipt can still
  //                                  print, cashier keeps working. A
  //                                  background process (syncPendingSales)
  //                                  will push it up automatically the
  //                                  moment a connection is available.
  //   • Write fails, NOT network  → rolled back entirely. This is a real
  //                                  rejection (bad data, permissions,
  //                                  etc.) that will never succeed just by
  //                                  retrying, so we don't pretend it
  //                                  worked — the cashier is told plainly
  //                                  and can retry after checking with the
  //                                  Owner.
  async recordSale(sale: Omit<Sale, "id" | "createdAt" | "syncStatus">): Promise<
    | { ok: true; sale: Sale; offline: boolean }
    | { ok: false; error?: string }
  > {
    const ns: Sale = { ...sale, id: crypto.randomUUID(), createdAt: new Date().toISOString(), syncStatus: "pending" };

    const prevSales = db.sales;
    const prevProducts = db.products;

    db.sales = [ns, ...db.sales];
    db.products = db.products.map((p) => {
      const line = ns.items.find((it) => it.productId === p.id);
      return line ? { ...p, quantity: Math.max(0, p.quantity - line.qty) } : p;
    });
    persist();

    const result = await supabasePush.insertSale(ns);

    if (result.ok) {
      const idx = db.sales.findIndex((s) => s.id === ns.id);
      if (idx !== -1) db.sales[idx] = { ...db.sales[idx], syncStatus: "synced" };
      this.audit("Sale completed", `₦${ns.total.toFixed(2)}`, ns.payment);
      persist();
      return { ok: true, sale: (idx !== -1 ? db.sales[idx] : ns), offline: false };
    }

    if (result.isNetworkError) {
      this.audit("Sale completed (offline — pending sync)", `₦${ns.total.toFixed(2)}`, ns.payment);
      persist();
      return { ok: true, sale: ns, offline: true };
    }

    db.sales = prevSales;
    db.products = prevProducts;
    persist();
    toast.error("Sale NOT saved — " + (result.error || "unknown error") + ". Please try again.", { duration: 8000 });
    return { ok: false, error: result.error };
  },

  // FIX (offline support): retries every locally-pending (unsynced) sale,
  // oldest first, so receipts land on the server in chronological order.
  // Called on: successful hydrate, the 30s poll (_syncFromServer), and the
  // browser's 'online' event. Stops at the first still-failing sale in a
  // given pass (almost always means we're still offline) rather than
  // hammering every pending sale on every retry.
  async syncPendingSales(): Promise<void> {
    if (!db.user?.organizationId) return;
    const pending = db.sales.filter((s) => s.syncStatus === "pending");
    if (!pending.length) return;

    const ordered = [...pending].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    let syncedCount = 0;
    for (const s of ordered) {
      const result = await supabasePush.insertSale(s);
      if (result.ok) {
        const idx = db.sales.findIndex((x) => x.id === s.id);
        if (idx !== -1) db.sales[idx] = { ...db.sales[idx], syncStatus: "synced" };
        syncedCount++;
      } else {
        break;
      }
    }
    if (syncedCount > 0) {
      persist();
      toast.success(`${syncedCount} offline sale${syncedCount > 1 ? "s" : ""} synced to the cloud`);
    }
  },

  addSupplier(s: Omit<Supplier, "id">) {
    const ns = { ...s, id: crypto.randomUUID() };
    db.suppliers.push(ns);
    this.audit("Added supplier", ns.name);
    persist();
    void supabasePush.insertSupplier(ns);
    return ns;
  },
  updateSupplier(id: string, patch: Partial<Supplier>) {
    db.suppliers = db.suppliers.map((s) => s.id === id ? { ...s, ...patch } : s);
    persist();
    void supabasePush.updateSupplier(id, patch);
  },
  deleteSupplier(id: string) {
    const s = db.suppliers.find((x) => x.id === id);
    db.suppliers = db.suppliers.filter((x) => x.id !== id);
    if (s) this.audit("Deleted supplier", s.name);
    persist();
    void supabasePush.deleteSupplier(id);
  },
  updateSettings(p: Partial<PharmacySettings>) {
    db.settings = { ...db.settings, ...p };
    persist();
    void supabasePush.updateOrgSettings(p);
  },
  audit(action: string, target: string, detail?: string) {
    const entry = { id: crypto.randomUUID(), user: db.user?.username ?? "system", action, target, detail, at: new Date().toISOString() };
    db.audit.unshift(entry);
    if (db.audit.length > 500) db.audit.length = 500;
    void supabasePush.insertAudit(entry);
  },
  login(username: string, password: string) {
    const cred = db.credentials.find((c) => c.username === username);
    const ok = cred && cred.passwordHash === hashPwd(password);
    const role: "Admin" | "Pharmacist" | null =
      username === "admin" ? "Admin" : username === "pharma" ? "Pharmacist" : null;
    const device = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : "Unknown";
    db.loginActivity.unshift({
      id: crypto.randomUUID(), username, at: new Date().toISOString(),
      device, status: ok && role ? "success" : "failed",
    });
    if (db.loginActivity.length > 100) db.loginActivity.length = 100;
    if (!ok || !role) { persist(); return false; }
    db.user = { username, role };
    // FIX: this legacy local-credential login path doesn't go through
    // hydrateFromSupabase() at all, so it must set authReady itself —
    // otherwise RouteGuard would show "Checking access..." forever for
    // these demo accounts.
    db.authReady = true;
    this.audit("Login", username);
    persist(); return true;
  },
  logout() {
    if (db.user) this.audit("Logout", db.user.username);
    db.user = null;
    db.authReady = false;
    persist();
  },
  changePassword(username: string, oldPwd: string, newPwd: string): { ok: boolean; error?: string } {
    const cred = db.credentials.find((c) => c.username === username);
    if (!cred) return { ok: false, error: "User not found" };
    if (cred.passwordHash !== hashPwd(oldPwd)) return { ok: false, error: "Current password is incorrect" };
    cred.passwordHash = hashPwd(newPwd);
    this.audit("Password changed", username);
    persist();
    return { ok: true };
  },
  clearLoginActivity(keepCurrent = true) {
    const currentUser = db.user?.username;
    if (keepCurrent && currentUser) {
      const latest = db.loginActivity.find((l) => l.username === currentUser && l.status === "success");
      db.loginActivity = latest ? [latest] : [];
    } else {
      db.loginActivity = [];
    }
    this.audit("Cleared other sessions", currentUser ?? "system");
    persist();
  },
  recordControlledDispense(d: Omit<ControlledDispense, "id" | "at" | "cashier">) {
    const entry: ControlledDispense = {
      ...d, id: crypto.randomUUID(), at: new Date().toISOString(), cashier: db.user?.username ?? "system",
    };
    db.controlledDispense.unshift(entry);
    const p = db.products.find((p) => p.id === d.productId);
    if (p) p.quantity = Math.max(0, p.quantity - d.quantity);
    this.audit("Controlled dispense", d.productName, `${d.quantity} to ${d.patientName} (Rx ${d.prescriptionRef})`);
    persist();
    void supabasePush.insertControlled(entry);
    if (p) void supabasePush.updateProduct(p.id, { quantity: p.quantity });
    return entry;
  },
  importProducts(rows: Omit<Product, "id">[]) {
    const newRows = rows.map((r) => ({ ...r, id: crypto.randomUUID() }));
    newRows.forEach((r) => db.products.push(r));
    this.audit("CSV import", `${rows.length} products`);
    persist();
    void supabasePush.insertProducts(newRows);
  },

  // FIX (root fix for both the Owner-flash bug AND offline usability):
  //
  // If this is the SAME user who was last confirmed on this device (we
  // still have their username + a confirmed memberRole from a previous
  // successful hydrate), we bridge that cached role in immediately and
  // mark authReady = true right away. This is what lets a Cashier open
  // the app with no signal and still ring up sales — we already know who
  // they are and what they're allowed to do, from last time we could
  // verify it. hydrateFromSupabase() then re-confirms (or corrects) this
  // in the background the moment a connection is available.
  //
  // If this is a NEW or unrecognized session (different email than what
  // was cached, or nothing cached at all), we do NOT guess a role — it
  // stays undefined and authReady stays false until Supabase confirms the
  // real membership. This is the fix for the original bug, where every
  // fresh session was briefly (or, on a bad connection, not-so-briefly)
  // treated as "Admin" regardless of the person's real role.
  //
  // Trade-off worth knowing: if an Owner changes a Cashier's role, or the
  // org's subscription lapses, while that Cashier's device is offline, the
  // device won't find out until it reconnects. This is the same trade-off
  // every offline-capable POS makes (Square, Shopify POS, etc.) — treat it
  // as "reconciles automatically on reconnect", not "instant everywhere".
  setAuthUser(u: { id: string; email: string } | null) {
    if (!u) {
      db.user = null;
      db.authReady = false;
      db.products = []; db.sales = []; db.suppliers = [];
      db.controlledDispense = []; db.audit = [];
      db.extendedSalesLoaded = false;
      persist();
      this.stopRealtime();
      return;
    }

    if (db.user && db.user.username === u.email && db.user.memberRole) {
      // Returning, already-verified session — trust it provisionally.
      db.authReady = true;
      persist();
      return;
    }

    db.user = { username: u.email, role: undefined };
    db.authReady = false;
    persist();
  },

  _realtimeChannel: null as ReturnType<typeof supabase.channel> | null,
  _pollInterval: null as ReturnType<typeof setInterval> | null,
  _hydrating: false,

  stopRealtime() {
    if (this._realtimeChannel) {
      supabase.removeChannel(this._realtimeChannel);
      this._realtimeChannel = null;
    }
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  },

  async _syncFromServer(orgId: string) {
    // FIX (offline support): always give pending sales a chance to sync
    // on the same cadence as the background poll.
    void this.syncPendingSales();

    try {
      const cutoff = salesCutoffISO();
      const [salesR, prodsR, orgR] = await Promise.all([
        supabase.from("sales").select("*, sale_items(*)").eq("organization_id", orgId).gte("created_at", cutoff).order("created_at", { ascending: false }),
        supabase.from("products_safe_view").select("*").eq("organization_id", orgId).range(0, 4999),
        (supabase.from as any)("organizations")
          .select("subscription_tier, subscription_expires_at, billing_status, grace_period_started_at, name, address, phone, email, logo, premise_license, owner_name, owner_photo")
          .eq("id", orgId).maybeSingle(),
      ]);
      let changed = false;
      if (salesR.data) {
        // FIX (offline support): MERGE instead of overwrite. Overwriting
        // db.sales wholesale with the server's copy would silently delete
        // any locally-pending (not-yet-synced) offline sale that the
        // server doesn't know about yet — exactly the "sale disappeared"
        // symptom, just from a different code path.
        const serverSales = salesR.data.map(rowToSale);
        const serverIds = new Set(serverSales.map((s) => s.id));
        const pendingLocal = db.sales.filter((s) => s.syncStatus === "pending" && !serverIds.has(s.id));
        const merged = [...pendingLocal, ...serverSales].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        const fresh = JSON.stringify(merged.map((s) => s.id + s.createdAt + s.syncStatus));
        const current = JSON.stringify(db.sales.map((s) => s.id + s.createdAt + s.syncStatus));
        if (fresh !== current) { db.sales = merged; changed = true; }
      }
      if (prodsR.data) {
        const fresh = JSON.stringify(prodsR.data.map((p: any) => p.id + p.quantity));
        const current = JSON.stringify(db.products.map((p) => p.id + p.quantity));
        if (fresh !== current) { db.products = prodsR.data.map(rowToProduct); changed = true; }
      }
      if (orgR.data) {
        const freshName = orgR.data.name;
        if (freshName !== db.settings.name) {
          db.settings = { ...db.settings, ...rowToSettings(orgR.data) };
          changed = true;
        }
        // FIX: keep billing/tier state fresh via the same poll/realtime
        // path — so a renewal or grace-period change made by the
        // scheduled renew-subscriptions job shows up without a full
        // re-login.
        if (db.user) {
          const newTier = orgR.data.subscription_tier ?? "free";
          const newExpiry = orgR.data.subscription_expires_at ?? null;
          const newBillingStatus = orgR.data.billing_status ?? "active";
          const newGraceStarted = orgR.data.grace_period_started_at ?? null;
          if (
            db.user.subscriptionTier !== newTier ||
            db.user.subscriptionExpiresAt !== newExpiry ||
            db.user.billingStatus !== newBillingStatus ||
            db.user.gracePeriodStartedAt !== newGraceStarted
          ) {
            db.user = {
              ...db.user,
              subscriptionTier: newTier,
              subscriptionExpiresAt: newExpiry,
              billingStatus: newBillingStatus,
              gracePeriodStartedAt: newGraceStarted,
            };
            changed = true;
          }
        }
      }
      if (changed) notify();
    } catch (e) {
      // silent — polling failure is non-critical
    }
  },

  startRealtime(orgId: string) {
    this.stopRealtime();

    const ch = supabase
      .channel(`org-sync-${orgId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sales" },
        () => { void this._syncFromServer(orgId); }
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "products" },
        () => { void this._syncFromServer(orgId); }
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "products" },
        () => { void this._syncFromServer(orgId); }
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "organizations" },
        () => { void this._syncFromServer(orgId); }
      )
      .subscribe();

    this._realtimeChannel = ch;
    this._pollInterval = setInterval(() => {
      void this._syncFromServer(orgId);
    }, 30_000);
  },

  async hydrateFromSupabase() {
    if (this._hydrating) return;
    this._hydrating = true;

    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const uid = auth.user.id;
      const email = auth.user.email || "";

      const { data: membership, error: membershipError } = await (supabase.from as any)("memberships")
        .select("organization_id, role, can_view_margins, status")
        .eq("user_id", uid)
        .eq("status", "active")
        .maybeSingle();

      console.log("[hydrate] uid:", uid, "email:", email);
      console.log("[hydrate] membership result:", membership, "error:", membershipError);

      if (!membership) {
        if (membershipError) {
          console.error("[hydrate] membership query failed:", membershipError.message);
          // FIX (offline support): if we already bridged in a cached role
          // for this exact user in setAuthUser(), authReady is already
          // true and the app is usable — this is just a background
          // refresh that couldn't complete, not a hard stop. Only alert
          // if we have NO usable cached state at all.
          if (!db.authReady) {
            toast.error("Could not verify your pharmacy account — check your connection and reload.");
          }
          return;
        }

        const { data: invited, error: invitedError } = await (supabase.from as any)("memberships")
          .select("id, organization_id, role, can_view_margins")
          .eq("invited_email", email.toLowerCase())
          .eq("status", "invited")
          .maybeSingle();

        if (invitedError) {
          console.error("[hydrate] invited lookup failed:", invitedError.message);
          if (!db.authReady) {
            toast.error("Could not verify your invite — check your connection and reload.");
          }
          return;
        }

        if (invited) {
          await (supabase.from as any)("memberships")
            .update({ user_id: uid, status: "active" })
            .eq("id", invited.id);
          toast.success("Welcome! You've been connected to your pharmacy.");
          this._hydrating = false;
          return this.hydrateFromSupabase();
        }

        const { data: newOrg } = await (supabase.from as any)("organizations")
          .insert({ owner_id: uid, name: "My Pharmacy" })
          .select("id")
          .single();

        if (newOrg) {
          await (supabase.from as any)("memberships").insert({
            organization_id: newOrg.id,
            user_id: uid,
            role: "Owner",
            can_view_margins: true,
            status: "active",
          });
          this._hydrating = false;
          return this.hydrateFromSupabase();
        }
        return;
      }

      const orgId: string = membership.organization_id;
      const memberRole: "Owner" | "Pharmacist" | "Cashier" = membership.role;
      const canViewMargins: boolean = membership.can_view_margins ?? false;
      const legacyRole: "Admin" | "Pharmacist" = memberRole === "Owner" ? "Admin" : "Pharmacist";

      db.user = {
        ...db.user,
        username: email,
        role: legacyRole,
        organizationId: orgId,
        memberRole,
        canViewMargins,
      };
      // FIX: this is the moment the role is actually confirmed by
      // Supabase — authoritative, overrides any bridged/cached value.
      db.authReady = true;
      persist();

      // FIX (offline support): now that org context is confirmed, give
      // any offline-queued sales from before this login/reconnect a
      // chance to sync right away, instead of waiting for the next poll.
      void this.syncPendingSales();

      const cutoff = salesCutoffISO();
      const [prodsR, salesR, supR, contR, audR, profR, orgR, planR] = await Promise.all([
        supabase.from("products_safe_view").select("*").eq("organization_id", orgId).range(0, 4999),
        supabase.from("sales").select("*, sale_items(*)").eq("organization_id", orgId).gte("created_at", cutoff).order("created_at", { ascending: false }),
        supabase.from("suppliers").select("*").eq("organization_id", orgId).order("name"),
        (supabase.from as any)("controlled_dispense").select("*").eq("organization_id", orgId).order("at", { ascending: false }),
        (supabase.from as any)("audit_logs").select("*").eq("organization_id", orgId).order("at", { ascending: false }).limit(500),
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
        (supabase.from as any)("organizations").select("subscription_tier, subscription_expires_at, billing_status, grace_period_started_at, name, address, phone, email, logo, premise_license, owner_name, owner_photo").eq("id", orgId).maybeSingle(),
        (supabase.from as any)("plan_config").select("*"),
      ]);

      if (prodsR.error) { console.error(prodsR.error); toast.error("Failed to load products"); }
      if (salesR.error) { console.error(salesR.error); toast.error("Failed to load sales"); }

      db.products = (prodsR.data || []).map(rowToProduct);

      // FIX (offline support): same merge logic as _syncFromServer — keep
      // any locally-pending sale that the server doesn't have yet, so a
      // reload right after an offline sale doesn't wipe it out.
      const serverSales = (salesR.data || []).map(rowToSale);
      const serverIds = new Set(serverSales.map((s: Sale) => s.id));
      const pendingLocal = db.sales.filter((s) => s.syncStatus === "pending" && !serverIds.has(s.id));
      db.sales = [...pendingLocal, ...serverSales].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      db.suppliers = (supR.data || []).map(rowToSupplier);
      db.controlledDispense = ((contR as any).data || []).map(rowToControlled);
      db.audit = ((audR as any).data || []).map(rowToAudit);
      if ((orgR as any)?.data) db.settings = { ...db.settings, ...rowToSettings((orgR as any).data) };

      const orgTier: string = (orgR as any)?.data?.subscription_tier ?? "free";
      const orgExpiry: string | null = (orgR as any)?.data?.subscription_expires_at ?? null;
      const orgBillingStatus: "active" | "grace_period" = (orgR as any)?.data?.billing_status ?? "active";
      const orgGraceStarted: string | null = (orgR as any)?.data?.grace_period_started_at ?? null;
      db.user = {
        ...db.user!,
        subscriptionTier: orgTier,
        subscriptionExpiresAt: orgExpiry,
        billingStatus: orgBillingStatus,
        gracePeriodStartedAt: orgGraceStarted,
      };

      const plans: any[] = (planR as any)?.data || [];
      const thisPlan = plans.find((p: any) => p.tier === orgTier) || plans.find((p: any) => p.tier === "free");

      db.plan = thisPlan ? {
        tier: thisPlan.tier,
        displayName: thisPlan.display_name,
        priceMonthly: Number(thisPlan.price_monthly),
        maxProducts: thisPlan.max_products,
        maxStaff: thisPlan.max_staff,
        maxSalesHistoryDays: thisPlan.max_sales_history_days,
        canAiForecast: thisPlan.can_ai_forecast,
        canPoisonsRegister: thisPlan.can_poisons_register,
        canReports: thisPlan.can_reports,
        canSuppliers: thisPlan.can_suppliers,
        canAuditTrail: thisPlan.can_audit_trail,
        canApiAccess: thisPlan.can_api_access ?? false,
        canDisposalReport: thisPlan.can_disposal_report ?? false,
      } : null;

      db.extendedSalesLoaded = false;
      persist();

      if (
        email.toLowerCase() === ADMIN_EMAIL.toLowerCase() &&
        db.products.length === 0 &&
        db.sales.length === 0
      ) {
        await seedAdminDemoData(uid, orgId);
        const [p2, s2, sup2] = await Promise.all([
          supabase.from("products_safe_view").select("*").eq("organization_id", orgId).range(0, 4999),
          supabase.from("sales").select("*, sale_items(*)").eq("organization_id", orgId).gte("created_at", cutoff).order("created_at", { ascending: false }),
          supabase.from("suppliers").select("*").eq("organization_id", orgId).order("name"),
        ]);
        db.products = (p2.data || []).map(rowToProduct);
        db.sales = (s2.data || []).map(rowToSale);
        db.suppliers = (sup2.data || []).map(rowToSupplier);
        persist();
        toast.success("Demo data loaded into your admin pharmacy");
      }

      this.startRealtime(orgId);
    } finally {
      this._hydrating = false;
    }
  },

  async loadExtendedSalesHistory(): Promise<{ ok: boolean; error?: string }> {
    const orgId = db.user?.organizationId;
    const maxDays = db.plan?.maxSalesHistoryDays ?? 0;
    if (!orgId) return { ok: false, error: "Not authenticated" };

    try {
      let query = supabase
        .from("sales")
        .select("*, sale_items(*)")
        .eq("organization_id", orgId)
        .order("created_at", { ascending: false });

      if (maxDays !== -1 && maxDays > 0) {
        const cutoff = new Date(Date.now() - maxDays * 86400000).toISOString();
        query = query.gte("created_at", cutoff);
      }

      const { data, error } = await query;
      if (error) return { ok: false, error: error.message };

      const existingIds = new Set(db.sales.map((s) => s.id));
      const newSales = (data || []).map(rowToSale).filter((s) => !existingIds.has(s.id));
      db.sales = [...db.sales, ...newSales].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      db.extendedSalesLoaded = true;
      persist();
      notify();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e.message ?? "Unknown error" };
    }
  },
};

function productToRow(p: Product, userId: string, orgId: string) {
  return {
    id: p.id, user_id: userId, organization_id: orgId,
    name: p.name, generic: p.generic, nafdac: p.nafdac, batch: p.batch,
    expiry: p.expiry || null, quantity: p.quantity, reorder_level: p.reorderLevel,
    reorder_quantity: p.reorderQuantity, pack_size: p.packSize, last_restocked: p.lastRestocked || null,
    cost_price: p.costPrice, selling_price: p.sellingPrice, supplier: p.supplier,
    supplier_id: p.supplierId || null, category: p.category, description: p.description || null,
    controlled: !!p.controlled, barcode: p.barcode || null,
    neml_drug_id: p.nemlDrugId || null, item_type: p.itemType || "pharmaceutical",
  };
}
function rowToProduct(r: any): Product {
  return {
    id: r.id, name: r.name, generic: r.generic || "", nafdac: r.nafdac || "", batch: r.batch || "",
    expiry: r.expiry || "", quantity: r.quantity || 0, reorderLevel: r.reorder_level || 0,
    reorderQuantity: r.reorder_quantity || 0, packSize: r.pack_size || "",
    lastRestocked: r.last_restocked || undefined, costPrice: r.cost_price != null ? Number(r.cost_price) : null,
    sellingPrice: Number(r.selling_price) || 0, supplier: r.supplier || "",
    supplierId: r.supplier_id || undefined, category: r.category || "", description: r.description || "",
    controlled: !!r.controlled, barcode: r.barcode || undefined,
    nemlDrugId: r.neml_drug_id || undefined, itemType: r.item_type || "pharmaceutical",
  };
}
function productPatchToRow(patch: Partial<Product>) {
  const out: any = {};
  const map: Record<string, string> = {
    name: "name", generic: "generic", nafdac: "nafdac", batch: "batch", expiry: "expiry",
    quantity: "quantity", reorderLevel: "reorder_level", reorderQuantity: "reorder_quantity",
    packSize: "pack_size", lastRestocked: "last_restocked", costPrice: "cost_price",
    sellingPrice: "selling_price", supplier: "supplier", supplierId: "supplier_id",
    category: "category", description: "description", controlled: "controlled",
    barcode: "barcode", nemlDrugId: "neml_drug_id", itemType: "item_type",
  };
  for (const [k, v] of Object.entries(patch)) {
    if (k in map) out[map[k]] = (k === "expiry" || k === "lastRestocked") ? (v || null) : v;
  }
  return out;
}
function rowToSale(r: any): Sale {
  return {
    id: r.id, total: Number(r.total) || 0, profit: Number(r.profit) || 0,
    payment: r.payment, cashier: r.cashier || "", customer: r.customer || undefined,
    createdAt: r.created_at,
    // Any row loaded FROM Supabase is, by definition, already saved there.
    syncStatus: "synced",
    items: (r.sale_items || []).map((it: any) => ({
      productId: it.product_id, name: it.name, qty: it.qty,
      price: Number(it.price), cost: Number(it.cost),
    })),
  };
}
function rowToSupplier(r: any): Supplier {
  return {
    id: r.id, name: r.name, contactPerson: r.contact_person || "", phone: r.phone || "",
    email: r.email || "", address: r.address || "", notes: r.notes || "",
  };
}
function supplierToRow(s: Supplier, userId: string, orgId: string) {
  return {
    id: s.id, user_id: userId, organization_id: orgId, name: s.name,
    contact_person: s.contactPerson || null, phone: s.phone || null,
    email: s.email || null, address: s.address || null, notes: s.notes || null,
  };
}
function supplierPatchToRow(patch: Partial<Supplier>) {
  const out: any = {};
  const map: Record<string, string> = { name: "name", contactPerson: "contact_person", phone: "phone", email: "email", address: "address", notes: "notes" };
  for (const [k, v] of Object.entries(patch)) if (k in map) out[map[k]] = v || null;
  return out;
}
function rowToControlled(r: any): ControlledDispense {
  return {
    id: r.id, productId: r.product_id || "", productName: r.product_name, batch: r.batch || "",
    quantity: r.quantity || 0, amount: Number(r.amount) || 0, patientName: r.patient_name,
    patientPhone: r.patient_phone || "", prescriber: r.prescriber, prescriberRegNo: r.prescriber_reg_no || "",
    prescriptionRef: r.prescription_ref, cashier: r.cashier || "", at: r.at,
  };
}
function rowToAudit(r: any): AuditEntry {
  return { id: r.id, user: r.username || "", action: r.action, target: r.target || "", detail: r.detail || undefined, at: r.at };
}
function rowToSettings(r: any): Partial<PharmacySettings> {
  return {
    name: r.name || undefined, address: r.address || undefined, phone: r.phone || undefined,
    email: r.email || undefined, premiseLicense: r.premise_license || undefined,
    logo: r.logo || undefined, ownerPhoto: r.owner_photo || undefined, ownerName: r.owner_name || undefined,
    vatEnabled: r.vat_enabled ?? undefined,
    vatRate: r.vat_rate != null ? Number(r.vat_rate) : undefined,
  };
}
function settingsPatchToRow(p: Partial<PharmacySettings>) {
  const out: any = {};
  if (p.name !== undefined) out.name = p.name;
  if (p.address !== undefined) out.address = p.address;
  if (p.phone !== undefined) out.phone = p.phone;
  if (p.email !== undefined) out.email = p.email;
  if (p.premiseLicense !== undefined) out.premise_license = p.premiseLicense;
  if (p.logo !== undefined) out.logo = p.logo;
  if (p.ownerPhoto !== undefined) out.owner_photo = p.ownerPhoto;
  if (p.ownerName !== undefined) out.owner_name = p.ownerName;
  if (p.vatEnabled !== undefined) out.vat_enabled = p.vatEnabled;
  if (p.vatRate !== undefined) out.vat_rate = p.vatRate;
  return out;
}

const supabasePush = {
  // FIX (offline support): getSession() reads the session already persisted
  // to localStorage by supabase-js and does NOT make a network call, unlike
  // getUser() which always re-validates against the Auth server. Using
  // getSession() here means we can still resolve "who is this" while
  // offline, so a sale write attempt gets far enough to correctly fail as
  // a network error (and get queued) instead of failing this earlier check
  // for an unrelated reason and being silently dropped.
  async _context(): Promise<{ uid: string; orgId: string } | null> {
    try {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user?.id;
      const orgId = db.user?.organizationId;
      if (!uid || !orgId) return null;
      return { uid, orgId };
    } catch {
      return null;
    }
  },
  async insertProduct(p: Product) {
    const ctx = await this._context(); if (!ctx) return;
    const { error } = await supabase.from("products").insert(productToRow(p, ctx.uid, ctx.orgId));
    if (error) { console.error(error); toast.error("Could not sync product to cloud"); }
  },
  async insertProducts(rows: Product[]) {
    const ctx = await this._context(); if (!ctx || !rows.length) return;
    const { error } = await supabase.from("products").insert(rows.map((r) => productToRow(r, ctx.uid, ctx.orgId)));
    if (error) { console.error(error); toast.error("Could not sync imported products"); }
  },
  async updateProduct(id: string, patch: Partial<Product>) {
    const ctx = await this._context(); if (!ctx) return;
    const row = productPatchToRow(patch);
    if (!Object.keys(row).length) return;
    const { error } = await supabase.from("products").update(row).eq("id", id).eq("organization_id", ctx.orgId);
    if (error) { console.error(error); toast.error("Could not sync product update"); }
  },
  async deleteProduct(id: string) {
    const ctx = await this._context(); if (!ctx) return;
    const { error } = await supabase.from("products").delete().eq("id", id).eq("organization_id", ctx.orgId);
    if (error) { console.error(error); toast.error("Could not delete product in cloud"); }
  },
  // FIX (offline support): returns { ok, error, isNetworkError } instead of
  // void. Wrapped in try/catch + a hard timeout (see withTimeout above) so
  // a hanging request on a bad connection doesn't leave the caller waiting
  // forever — it resolves to a network-classified failure instead.
  async insertSale(s: Sale): Promise<{ ok: boolean; error?: string; isNetworkError?: boolean }> {
    const ctx = await this._context();
    if (!ctx) {
      // Most commonly: couldn't confirm the session because we're
      // offline. Treat as network so the sale queues instead of being
      // silently skipped like the old behavior.
      return { ok: false, error: "offline", isNetworkError: true };
    }

    try {
      const { error: e1 } = await withTimeout(
        supabase.from("sales").insert({
          id: s.id, user_id: ctx.uid, organization_id: ctx.orgId,
          total: s.total, profit: s.profit, payment: s.payment,
          cashier: s.cashier, customer: s.customer || null, created_at: s.createdAt,
        }),
        SALE_WRITE_TIMEOUT_MS,
      );
      if (e1) {
        console.error(e1);
        return { ok: false, error: e1.message, isNetworkError: isNetworkErrorMessage(e1.message) };
      }

      if (s.items.length) {
        const { error: e2 } = await withTimeout(
          supabase.from("sale_items").insert(
            s.items.map((it) => ({
              sale_id: s.id, product_id: it.productId || null, name: it.name,
              qty: it.qty, price: it.price, cost: it.cost ?? 0,
            })),
          ),
          SALE_WRITE_TIMEOUT_MS,
        );
        // NOTE: if the sale header above succeeded but this fails for a
        // genuine (non-network) reason, the sale row exists server-side
        // with no line items. Fully closing this requires wrapping both
        // inserts in one DB transaction via an Edge Function, similar to
        // confirm-seat-payment. Flagging as a possible follow-up.
        if (e2) {
          console.error(e2);
          return { ok: false, error: e2.message, isNetworkError: isNetworkErrorMessage(e2.message) };
        }
      }

      for (const it of s.items) {
        const p = db.products.find((p) => p.id === it.productId);
        if (p) await supabasePush.updateProduct(p.id, { quantity: p.quantity });
      }
      return { ok: true };
    } catch (e: any) {
      // A thrown exception (rather than a returned {error}) means the
      // request never got a real answer from the server — no internet,
      // DNS failure, or our own timeout firing. Always network-classified.
      return { ok: false, error: e?.message || "Network error", isNetworkError: true };
    }
  },
  async insertSupplier(s: Supplier) {
    const ctx = await this._context(); if (!ctx) return;
    const { error } = await supabase.from("suppliers").insert(supplierToRow(s, ctx.uid, ctx.orgId));
    if (error) { console.error(error); toast.error("Could not sync supplier"); }
  },
  async updateSupplier(id: string, patch: Partial<Supplier>) {
    const ctx = await this._context(); if (!ctx) return;
    const row = supplierPatchToRow(patch);
    if (!Object.keys(row).length) return;
    const { error } = await supabase.from("suppliers").update(row).eq("id", id).eq("organization_id", ctx.orgId);
    if (error) { console.error(error); toast.error("Could not sync supplier update"); }
  },
  async deleteSupplier(id: string) {
    const ctx = await this._context(); if (!ctx) return;
    const { error } = await supabase.from("suppliers").delete().eq("id", id).eq("organization_id", ctx.orgId);
    if (error) { console.error(error); toast.error("Could not delete supplier"); }
  },
  async insertControlled(d: ControlledDispense) {
    const ctx = await this._context(); if (!ctx) return;
    const { error } = await (supabase.from as any)("controlled_dispense").insert({
      id: d.id, user_id: ctx.uid, organization_id: ctx.orgId,
      product_id: d.productId || null, product_name: d.productName,
      batch: d.batch, quantity: d.quantity, amount: d.amount, patient_name: d.patientName,
      patient_phone: d.patientPhone || null, prescriber: d.prescriber,
      prescriber_reg_no: d.prescriberRegNo || null, prescription_ref: d.prescriptionRef,
      cashier: d.cashier, at: d.at,
    });
    if (error) { console.error(error); toast.error("Could not sync controlled dispense"); }
  },
  async insertAudit(a: AuditEntry) {
    const ctx = await this._context(); if (!ctx) return;
    const { error } = await (supabase.from as any)("audit_logs").insert({
      id: a.id, user_id: ctx.uid, organization_id: ctx.orgId,
      username: a.user, action: a.action,
      target: a.target, detail: a.detail || null, at: a.at,
    });
    if (error) console.error(error);
  },
  async updateOrgSettings(p: Partial<PharmacySettings>) {
    const ctx = await this._context(); if (!ctx) return;
    const row = settingsPatchToRow(p);
    if (!Object.keys(row).length) return;
    const { error } = await (supabase.from as any)("organizations").update(row).eq("id", ctx.orgId);
    if (error) { console.error(error); toast.error("Could not save pharmacy settings"); }
  },
};

async function seedAdminDemoData(uid: string, orgId: string) {
  const seed = makeSeed();
  const supRows = seed.suppliers.map((s) => supplierToRow(s, uid, orgId));
  if (supRows.length) {
    const { error } = await supabase.from("suppliers").insert(supRows);
    if (error) { console.error(error); }
  }
  const prodRows = seed.products.map((p) => productToRow(p, uid, orgId));
  if (prodRows.length) {
    const { error } = await supabase.from("products").insert(prodRows);
    if (error) { toast.error("Failed to seed demo products"); return; }
  }
  for (const s of seed.sales) {
    const { error: e1 } = await supabase.from("sales").insert({
      id: s.id, user_id: uid, organization_id: orgId,
      total: s.total, profit: s.profit, payment: s.payment,
      cashier: s.cashier, customer: s.customer || null, created_at: s.createdAt,
    });
    if (e1) { console.error(e1); continue; }
    if (s.items.length) {
      const { error: e2 } = await supabase.from("sale_items").insert(
        s.items.map((it) => ({
          sale_id: s.id, product_id: it.productId || null, name: it.name,
          qty: it.qty, price: it.price, cost: it.cost ?? 0,
        })),
      );
      if (e2) console.error(e2);
    }
  }
}

// FIX (offline support): module-level connectivity listeners. Set up once
// when this module first loads. On 'online', immediately attempt to sync
// any pending sales rather than waiting for the next 30s poll — a cashier
// who's been offline for a while shouldn't have to wait half a minute
// after their signal comes back.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    db.isOffline = false;
    notify();
    void store.syncPendingSales();
  });
  window.addEventListener("offline", () => {
    db.isOffline = true;
    notify();
  });
}

export function useStore<T>(selector: (db: DB) => T): T {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => selector(store.get()),
    () => selector(store.get()),
  );
}

export function salesVelocityMap(sales: Sale[], days = 30): Map<string, number> {
  const since = Date.now() - days * 86400000;
  const m = new Map<string, number>();
  for (const s of sales) {
    if (new Date(s.createdAt).getTime() < since) continue;
    for (const it of s.items) m.set(it.productId, (m.get(it.productId) || 0) + it.qty);
  }
  return m;
}

export function movementSpeed(unitsLast30: number): "Fast" | "Medium" | "Slow" {
  if (unitsLast30 >= 30) return "Fast";
  if (unitsLast30 >= 5) return "Medium";
  return "Slow";
}

export function usePlan() {
  const plan = useStore((s) => s.plan);
  const user = useStore((s) => s.user);
  const products = useStore((s) => s.products);

  const isExpired = user?.subscriptionExpiresAt
    ? new Date(user.subscriptionExpiresAt) < new Date()
    : false;

  const effectivePlan = isExpired ? null : plan;

  return {
    plan: effectivePlan,
    tier: isExpired ? "free" : (user?.subscriptionTier ?? "free"),
    isExpired,
    canAiForecast:       effectivePlan?.canAiForecast       ?? false,
    canPoisonsRegister:  effectivePlan?.canPoisonsRegister  ?? false,
    canReports:          effectivePlan?.canReports          ?? false,
    canSuppliers:        effectivePlan?.canSuppliers        ?? false,
    canAuditTrail:       effectivePlan?.canAuditTrail       ?? false,
    canApiAccess:        effectivePlan?.canApiAccess        ?? false,
    canDisposalReport:   effectivePlan?.canDisposalReport   ?? false,
    atProductLimit: effectivePlan
      ? (effectivePlan.maxProducts !== -1 && products.length >= effectivePlan.maxProducts)
      : products.length >= 50,
    productLimit: effectivePlan?.maxProducts ?? 50,
    staffLimit:   effectivePlan?.maxStaff   ?? 1,
    // FIX: surfaces grace-period state so UI (Plan & Billing tab, sidebar)
    // can warn the Owner before an automatic downgrade to Free happens.
    billingStatus: user?.billingStatus ?? "active",
    gracePeriodStartedAt: user?.gracePeriodStartedAt ?? null,
  };
}
