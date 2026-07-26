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
  active?: boolean;
  // FIX (shelf location): structured as Aisle / Shelf / Bin rather than a
  // single free-text field — sortable/filterable independently, and
  // extensible later (e.g. a branch/zone layer for multi-branch pharmacies)
  // without reworking the shape. All three optional — location tracking is
  // opt-in per product.
  shelfAisle?: string;
  shelfShelf?: string;
  shelfBin?: string;
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
  role?: "Admin" | "Pharmacist";
  organizationId?: string;
  memberRole?: "Owner" | "Pharmacist" | "Cashier";
  canViewMargins?: boolean;
  subscriptionTier?: string;
  subscriptionExpiresAt?: string | null;
  billingStatus?: "active" | "grace_period";
  gracePeriodStartedAt?: string | null;
};

export type PlanConfig = {
  tier: string;
  displayName: string;
  priceMonthly: number;
  maxProducts: number;
  maxStaff: number;
  maxSalesHistoryDays: number;
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
  syncStatus?: "synced" | "pending";
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
  authReady: boolean;
  isOffline: boolean;
};

const KEY = "pharmaguard_db_v3";
const ADMIN_EMAIL = "phlair222@gmail.com";

const SALES_HYDRATE_DAYS = 90;
function salesCutoffISO(): string {
  return new Date(Date.now() - SALES_HYDRATE_DAYS * 86400000).toISOString();
}

const SALE_WRITE_TIMEOUT_MS = 15000;
function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Request timed out — weak or no connection")), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

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
    parsed.controlledDispense = (parsed.controlledDispense || []).map((c: ControlledDispense) => ({
      ...c, syncStatus: c.syncStatus ?? "synced",
    }));
    parsed.loginActivity = parsed.loginActivity || [];
    parsed.credentials = parsed.credentials || [];
    parsed.extendedSalesLoaded = parsed.extendedSalesLoaded || false;
    parsed.sales = (parsed.sales || []).map((s) => ({ ...s, syncStatus: s.syncStatus ?? "synced" }));
    parsed.authReady = false;
    parsed.isOffline = typeof navigator !== "undefined" ? !navigator.onLine : false;
    return parsed;
  } catch {
    return emptyDb();
  }
}

let db: DB = load();
const listeners = new Set<() => void>();

function sanitizeForPersist(state: DB): DB {
  return {
    ...state,
    controlledDispense: state.controlledDispense.map((d) =>
      d.syncStatus === "synced" || d.syncStatus === undefined
        ? { ...d, patientName: "[synced — see cloud record]", patientPhone: undefined, prescriber: "[synced — see cloud record]", prescriberRegNo: undefined }
        : d
    ),
    sales: state.sales.map((s) =>
      s.syncStatus === "synced" || s.syncStatus === undefined
        ? { ...s, customer: undefined }
        : s
    ),
  };
}

function persist() {
  localStorage.setItem(KEY, JSON.stringify(sanitizeForPersist(db)));
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
  async deleteProduct(id: string): Promise<
    | { ok: true; outcome: "deleted" | "archived" }
    | { ok: false; error: string }
  > {
    const p = db.products.find((p) => p.id === id);
    const result = await supabasePush.deleteOrArchiveProduct(id);
    if (!result.ok) {
      return { ok: false, error: result.error || "Could not reach server" };
    }
    if (result.outcome === "archived") {
      db.products = db.products.map((pr) => (pr.id === id ? { ...pr, active: false } : pr));
      if (p) this.audit("Archived product", p.name, "Has sales/dispense history — hidden from Inventory, preserved for records");
    } else {
      db.products = db.products.filter((pr) => pr.id !== id);
      if (p) this.audit("Deleted product", p.name);
    }
    persist();
    return { ok: true, outcome: result.outcome };
  },
  restoreProduct(id: string) {
    const p = db.products.find((p) => p.id === id);
    db.products = db.products.map((pr) => (pr.id === id ? { ...pr, active: true } : pr));
    if (p) this.audit("Restored product", p.name);
    persist();
    void supabasePush.updateProduct(id, { active: true });
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
    console.error("[recordSale] failed:", result.error);
    toast.error("Sale could not be saved. Please try again, or contact your pharmacy owner if this continues.", { duration: 8000 });
    return { ok: false, error: result.error };
  },

  async syncPendingSales(): Promise<void> {
    if (!db.user?.organizationId) return;
    if (this._syncingSales) return;
    const pending = db.sales.filter((s) => s.syncStatus === "pending");
    if (!pending.length) return;

    this._syncingSales = true;
    try {
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
    } finally {
      this._syncingSales = false;
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
    db.authReady = true;
    this.audit("Login", username);
    persist(); return true;
  },
  logout() {
    if (db.user) this.audit("Logout", db.user.username);
    this.stopRealtime();
    localStorage.removeItem(KEY);
    db = emptyDb();
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
  async recordControlledDispense(d: Omit<ControlledDispense, "id" | "at" | "cashier" | "syncStatus">): Promise<
    | { ok: true; entry: ControlledDispense; offline: boolean }
    | { ok: false; error?: string }
  > {
    const entry: ControlledDispense = {
      ...d, id: crypto.randomUUID(), at: new Date().toISOString(),
      cashier: db.user?.username ?? "system", syncStatus: "pending",
    };

    const prevControlled = db.controlledDispense;
    const prevProducts = db.products;

    db.controlledDispense = [entry, ...db.controlledDispense];
    db.products = db.products.map((p) =>
      p.id === d.productId ? { ...p, quantity: Math.max(0, p.quantity - d.quantity) } : p
    );
    persist();

    const result = await supabasePush.insertControlled(entry);

    if (result.ok) {
      const idx = db.controlledDispense.findIndex((c) => c.id === entry.id);
      if (idx !== -1) db.controlledDispense[idx] = { ...db.controlledDispense[idx], syncStatus: "synced" };
      this.audit("Controlled dispense", d.productName, `${d.quantity} to ${d.patientName} (Rx ${d.prescriptionRef})`);
      persist();
      return { ok: true, entry: (idx !== -1 ? db.controlledDispense[idx] : entry), offline: false };
    }

    if (result.isNetworkError) {
      this.audit(
        "Controlled dispense (offline — pending sync)",
        d.productName,
        `${d.quantity} to ${d.patientName} (Rx ${d.prescriptionRef})`
      );
      persist();
      return { ok: true, entry, offline: true };
    }

    db.controlledDispense = prevControlled;
    db.products = prevProducts;
    persist();
    console.error("[recordControlledDispense] failed:", result.error);
    toast.error("Controlled dispense could not be saved. Please try again or contact the Owner.", { duration: 8000 });
    return { ok: false, error: result.error };
  },

  async syncPendingControlledDispenses(): Promise<void> {
    if (!db.user?.organizationId) return;
    if (this._syncingControlled) return;
    const pending = db.controlledDispense.filter((c) => c.syncStatus === "pending");
    if (!pending.length) return;

    this._syncingControlled = true;
    try {
      const ordered = [...pending].sort(
        (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
      );

      let syncedCount = 0;
      for (const c of ordered) {
        const result = await supabasePush.insertControlled(c);
        if (result.ok) {
          const idx = db.controlledDispense.findIndex((x) => x.id === c.id);
          if (idx !== -1) db.controlledDispense[idx] = { ...db.controlledDispense[idx], syncStatus: "synced" };
          syncedCount++;
        } else {
          break;
        }
      }
      if (syncedCount > 0) {
        persist();
        toast.success(`${syncedCount} offline controlled-dispense record${syncedCount > 1 ? "s" : ""} synced to the cloud`);
      }
    } finally {
      this._syncingControlled = false;
    }
  },
  importProducts(rows: Omit<Product, "id">[]) {
    const newRows = rows.map((r) => ({ ...r, id: crypto.randomUUID() }));
    newRows.forEach((r) => db.products.push(r));
    this.audit("CSV import", `${rows.length} products`);
    persist();
    void supabasePush.insertProducts(newRows);
  },

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
  _syncingSales: false,
  _syncingControlled: false,

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
    void this.syncPendingSales();
    void this.syncPendingControlledDispenses();

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

      if (!membership) {
        if (membershipError) {
          console.error("[hydrate] membership query failed:", membershipError.message);
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
      db.authReady = true;
      persist();

      void this.syncPendingSales();
      void this.syncPendingControlledDispenses();

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
    shelf_aisle: p.shelfAisle || null, shelf_shelf: p.shelfShelf || null, shelf_bin: p.shelfBin || null,
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
    active: r.active !== false,
    shelfAisle: r.shelf_aisle || undefined, shelfShelf: r.shelf_shelf || undefined, shelfBin: r.shelf_bin || undefined,
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
    active: "active",
    shelfAisle: "shelf_aisle", shelfShelf: "shelf_shelf", shelfBin: "shelf_bin",
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
    syncStatus: "synced",
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
  async deleteOrArchiveProduct(id: string): Promise<
    { ok: true; outcome: "deleted" | "archived" } | { ok: false; error?: string }
  > {
    const ctx = await this._context();
    if (!ctx) return { ok: false, error: "offline" };
    try {
      const { data, error } = await withTimeout(
        supabase.rpc("delete_or_archive_product", { p_product_id: id }),
        SALE_WRITE_TIMEOUT_MS,
      );
      if (error) {
        console.error(error);
        return { ok: false, error: error.message };
      }
      const outcome: "deleted" | "archived" = data === "archived" ? "archived" : "deleted";
      return { ok: true, outcome };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Network error" };
    }
  },
  async insertSale(s: Sale): Promise<{ ok: boolean; error?: string; isNetworkError?: boolean }> {
    const ctx = await this._context();
    if (!ctx) {
      return { ok: false, error: "offline", isNetworkError: true };
    }

    try {
      const { error } = await withTimeout(
        supabase.rpc("record_sale_atomic", {
          p_sale_id: s.id,
          p_organization_id: ctx.orgId,
          p_user_id: ctx.uid,
          p_cashier: s.cashier,
          p_customer: s.customer || null,
          p_payment: s.payment,
          p_total: s.total,
          p_profit: s.profit,
          p_items: s.items.map((it) => ({
            product_id: it.productId || null,
            name: it.name,
            qty: it.qty,
            price: it.price,
            cost: it.cost ?? 0,
          })),
        }),
        SALE_WRITE_TIMEOUT_MS,
      );

      if (error) {
        console.error(error);
        return { ok: false, error: error.message, isNetworkError: isNetworkErrorMessage(error.message) };
      }

      return { ok: true };
    } catch (e: any) {
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
  async insertControlled(d: ControlledDispense): Promise<{ ok: boolean; error?: string; isNetworkError?: boolean }> {
    const ctx = await this._context();
    if (!ctx) {
      return { ok: false, error: "offline", isNetworkError: true };
    }

    try {
      const { error } = await withTimeout(
        supabase.rpc("record_dispense_atomic", {
          p_dispense_id: d.id,
          p_organization_id: ctx.orgId,
          p_user_id: ctx.uid,
          p_product_id: d.productId || null,
          p_product_name: d.productName,
          p_batch: d.batch,
          p_quantity: d.quantity,
          p_amount: d.amount,
          p_patient_name: d.patientName,
          p_patient_phone: d.patientPhone || null,
          p_prescriber: d.prescriber,
          p_prescriber_reg_no: d.prescriberRegNo || null,
          p_prescription_ref: d.prescriptionRef,
          p_cashier: d.cashier,
        }),
        SALE_WRITE_TIMEOUT_MS,
      );
      if (error) {
        console.error(error);
        return { ok: false, error: error.message, isNetworkError: isNetworkErrorMessage(error.message) };
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || "Network error", isNetworkError: true };
    }
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

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    db.isOffline = false;
    notify();
    void store.syncPendingSales();
    void store.syncPendingControlledDispenses();
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
    billingStatus: user?.billingStatus ?? "active",
    gracePeriodStartedAt: user?.gracePeriodStartedAt ?? null,
  };
}
