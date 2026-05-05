import { useSyncExternalStore } from "react";

export type Product = {
  id: string;
  name: string;
  generic: string;
  nafdac: string;
  batch: string;
  expiry: string; // ISO date
  quantity: number;
  reorderLevel: number;
  costPrice: number;
  sellingPrice: number;
  supplier: string;
  category: string;
  description?: string;
  controlled?: boolean;
  barcode?: string;
};

export type SaleItem = { productId: string; name: string; qty: number; price: number };
export type Sale = {
  id: string;
  items: SaleItem[];
  total: number;
  profit: number;
  payment: "Cash" | "POS" | "Bank Transfer" | "Mobile Money";
  cashier: string;
  customer?: string;
  createdAt: string;
};

export type AuditEntry = {
  id: string;
  user: string;
  action: string;
  target: string;
  detail?: string;
  at: string;
};

export type User = { username: string; role: "Admin" | "Pharmacist" };

type DB = {
  products: Product[];
  sales: Sale[];
  audit: AuditEntry[];
  user: User | null;
};

const KEY = "pharmaguard_db_v1";

const seedProducts: Array<[string, string, string, string, number, number, number, number, string, string]> = [
  ["Paracetamol 500mg", "Paracetamol", "A4-1234", "PCM-2024-001", 240, 60, 8, 15, "Emzor", "Analgesics"],
  ["Amoxicillin 500mg", "Amoxicillin", "A4-2210", "AMX-2024-014", 35, 30, 35, 60, "Fidson", "Antibiotics"],
  ["Coartem 80/480", "Artemether/Lumefantrine", "A4-9911", "CRT-2024-007", 18, 20, 950, 1500, "Novartis", "Antimalarials"],
  ["Lonart DS", "Artemether/Lumefantrine", "A4-7765", "LNT-2023-118", 12, 15, 850, 1300, "Greenlife", "Antimalarials"],
  ["Flagyl 200mg", "Metronidazole", "A4-3321", "MTZ-2024-022", 80, 40, 12, 25, "May & Baker", "Antibiotics"],
  ["Vitamin C 1000mg", "Ascorbic Acid", "A4-1188", "VTC-2024-090", 150, 50, 80, 150, "Emzor", "Vitamins"],
  ["Lopinavir/Ritonavir", "Lopinavir/Ritonavir", "A4-5544", "ARV-2024-005", 6, 10, 4500, 7000, "Mylan", "Antiretrovirals"],
  ["Postinor 2", "Levonorgestrel", "A4-2299", "PST-2023-034", 22, 12, 800, 1500, "Gedeon Richter", "Contraceptives"],
  ["Glucophage 500mg", "Metformin", "A4-7012", "MTF-2024-019", 90, 30, 20, 40, "Merck", "Antidiabetics"],
  ["Amlodipine 10mg", "Amlodipine", "A4-3387", "AML-2024-031", 65, 25, 25, 55, "Fidson", "Cardiovascular"],
  ["Codeine Linctus", "Codeine", "A4-9001", "CDN-2024-002", 8, 10, 1200, 2000, "GSK", "Controlled Substances"],
  ["Tramadol 50mg", "Tramadol", "A4-9002", "TRM-2024-003", 14, 10, 30, 70, "Fidson", "Controlled Substances"],
];

function makeSeed(): DB {
  const today = Date.now();
  const dayOff = (d: number) => new Date(today + d * 86400000).toISOString().slice(0, 10);
  const exps = [400, 20, 75, -10, 300, 500, 45, 25, 600, 200, 80, 15];
  const products: Product[] = seedProducts.map((p, i) => ({
    id: crypto.randomUUID(),
    name: p[0] as string,
    generic: p[1] as string,
    nafdac: p[2] as string,
    batch: p[3] as string,
    quantity: p[4] as number,
    reorderLevel: p[5] as number,
    costPrice: p[6] as number,
    sellingPrice: p[7] as number,
    supplier: p[8] as string,
    category: p[9] as string,
    expiry: dayOff(exps[i]),
    controlled: (p[9] as string) === "Controlled Substances",
    description: "",
  }));
  // generate sample sales for last 7 days
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
        items.push({ productId: p.id, name: p.name, qty, price: p.sellingPrice });
        total += qty * p.sellingPrice;
        profit += qty * (p.sellingPrice - p.costPrice);
      }
      sales.push({
        id: crypto.randomUUID(),
        items, total, profit,
        payment: (["Cash","POS","Bank Transfer","Mobile Money"] as const)[Math.floor(Math.random()*4)],
        cashier: "admin",
        createdAt: new Date(today - d * 86400000 - Math.random() * 80000000).toISOString(),
      });
    }
  }
  return { products, sales, audit: [], user: null };
}

function load(): DB {
  if (typeof window === "undefined") return { products: [], sales: [], audit: [], user: null };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const seed = makeSeed();
      localStorage.setItem(KEY, JSON.stringify(seed));
      return seed;
    }
    return JSON.parse(raw);
  } catch {
    return { products: [], sales: [], audit: [], user: null };
  }
}

let db: DB = load();
const listeners = new Set<() => void>();

function persist() {
  localStorage.setItem(KEY, JSON.stringify(db));
  listeners.forEach((l) => l());
}

export const store = {
  get: () => db,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  reset() {
    localStorage.removeItem(KEY);
    db = load();
    persist();
  },
  // products
  addProduct(p: Omit<Product, "id">) {
    const np = { ...p, id: crypto.randomUUID() };
    db.products.push(np);
    this.audit("Added product", np.name);
    persist();
    return np;
  },
  updateProduct(id: string, patch: Partial<Product>) {
    db.products = db.products.map((p) => (p.id === id ? { ...p, ...patch } : p));
    const p = db.products.find((p) => p.id === id);
    if (p) this.audit("Updated product", p.name, JSON.stringify(patch));
    persist();
  },
  deleteProduct(id: string) {
    const p = db.products.find((p) => p.id === id);
    db.products = db.products.filter((p) => p.id !== id);
    if (p) this.audit("Deleted product", p.name);
    persist();
  },
  receiveStock(id: string, qty: number) {
    const p = db.products.find((p) => p.id === id);
    if (!p) return;
    p.quantity += qty;
    this.audit("Received stock", p.name, `+${qty}`);
    persist();
  },
  adjustStock(id: string, qty: number, reason: string) {
    const p = db.products.find((p) => p.id === id);
    if (!p) return;
    p.quantity = Math.max(0, p.quantity + qty);
    this.audit("Stock adjustment", p.name, `${qty >= 0 ? "+" : ""}${qty} (${reason})`);
    persist();
  },
  // sales
  recordSale(sale: Omit<Sale, "id" | "createdAt">) {
    const ns: Sale = { ...sale, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    db.sales.unshift(ns);
    for (const it of ns.items) {
      const p = db.products.find((p) => p.id === it.productId);
      if (p) p.quantity = Math.max(0, p.quantity - it.qty);
    }
    this.audit("Sale completed", `₦${ns.total.toFixed(2)}`, ns.payment);
    persist();
    return ns;
  },
  // audit
  audit(action: string, target: string, detail?: string) {
    db.audit.unshift({
      id: crypto.randomUUID(),
      user: db.user?.username ?? "system",
      action, target, detail,
      at: new Date().toISOString(),
    });
    if (db.audit.length > 500) db.audit.length = 500;
  },
  // auth (demo)
  login(username: string, password: string) {
    const role: "Admin" | "Pharmacist" =
      username === "admin" && password === "admin" ? "Admin" :
      username === "pharma" && password === "pharma" ? "Pharmacist" :
      null as any;
    if (!role) return false;
    db.user = { username, role };
    this.audit("Login", username);
    persist();
    return true;
  },
  logout() {
    if (db.user) this.audit("Logout", db.user.username);
    db.user = null;
    persist();
  },
  importProducts(rows: Omit<Product, "id">[]) {
    rows.forEach((r) => db.products.push({ ...r, id: crypto.randomUUID() }));
    this.audit("CSV import", `${rows.length} products`);
    persist();
  },
};

export function useStore<T>(selector: (db: DB) => T): T {
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => selector(store.get()),
    () => selector(store.get()),
  );
}
