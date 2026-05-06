import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, PackagePlus, Search, Upload, Download } from "lucide-react";
import { store, useStore, Product, salesVelocityMap, movementSpeed } from "@/lib/store";
import { NGN, expiryTier, expiryBadgeClass, daysUntil, movementBadgeClass } from "@/lib/format";
import { toast } from "sonner";
import { format } from "date-fns";

const CATEGORIES = ["Analgesics","Antibiotics","Antimalarials","Antiretrovirals","Antidiabetics","Cardiovascular","Vitamins","Contraceptives","Controlled Substances","Other"];
const PACK_SIZES = ["Tablet","Capsule","Bottle","Sachet","Box","Vial","Tube","5ml","10ml","100ml","Pack of 6","Pack of 10"];

const empty: Omit<Product, "id"> = {
  name: "", generic: "", nafdac: "", batch: "", expiry: "", quantity: 0,
  reorderLevel: 10, reorderQuantity: 30, packSize: "Tablet",
  costPrice: 0, sellingPrice: 0, supplier: "", category: "Analgesics", description: "",
};

export default function Inventory() {
  const products = useStore((s) => s.products);
  const sales = useStore((s) => s.sales);
  const suppliers = useStore((s) => s.suppliers);
  const [params, setParams] = useSearchParams();
  const filter = params.get("filter") || "all";
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [editing, setEditing] = useState<Product | null>(null);
  const [draft, setDraft] = useState<Omit<Product, "id">>(empty);
  const [open, setOpen] = useState(false);
  const [receiveFor, setReceiveFor] = useState<Product | null>(null);
  const [receiveQty, setReceiveQty] = useState(0);

  const velocity = useMemo(() => salesVelocityMap(sales, 30), [sales]);

  const list = useMemo(() => {
    return products.filter((p) => {
      const t = expiryTier(p.expiry);
      if (filter === "low" && p.quantity > p.reorderLevel) return false;
      if (filter === "near" && t !== "red" && t !== "yellow") return false;
      if (filter === "expired" && daysUntil(p.expiry) >= 0) return false;
      if (cat !== "all" && p.category !== cat) return false;
      const term = q.trim().toLowerCase();
      if (!term) return true;
      return p.name.toLowerCase().includes(term)
        || p.generic.toLowerCase().includes(term)
        || p.nafdac.toLowerCase().includes(term)
        || p.batch.toLowerCase().includes(term);
    });
  }, [products, q, cat, filter]);

  const openNew = () => { setEditing(null); setDraft(empty); setOpen(true); };
  const openEdit = (p: Product) => { setEditing(p); setDraft({ ...p }); setOpen(true); };
  const save = () => {
    if (!draft.name || !draft.expiry) { toast.error("Name and expiry are required"); return; }
    const final = { ...draft };
    if (final.supplierId) {
      const s = suppliers.find((x) => x.id === final.supplierId);
      if (s) final.supplier = s.name;
    }
    if (editing) { store.updateProduct(editing.id, final); toast.success("Product updated"); }
    else { store.addProduct(final); toast.success("Product added"); }
    setOpen(false);
  };
  const remove = (p: Product) => { if (confirm(`Delete ${p.name}?`)) { store.deleteProduct(p.id); toast.success("Deleted"); } };

  const exportCSV = () => {
    const headers = ["name","generic","nafdac","batch","expiry","quantity","reorderLevel","reorderQuantity","packSize","lastRestocked","costPrice","sellingPrice","supplier","category"];
    const rows = products.map((p) => headers.map((h) => JSON.stringify((p as any)[h] ?? "")).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `inventory-${format(new Date(), "yyyy-MM-dd")}.csv`; a.click();
  };
  const importCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const [head, ...lines] = text.split(/\r?\n/).filter(Boolean);
      const headers = head.split(",").map((s) => s.replace(/(^"|"$)/g, ""));
      const rows = lines.map((ln) => {
        const cols = ln.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/,"").replace(/^"|"$/g,"").replace(/""/g,'"')) || [];
        const obj: any = { ...empty };
        headers.forEach((h, i) => obj[h] = cols[i] ?? "");
        ["quantity","reorderLevel","reorderQuantity","costPrice","sellingPrice"].forEach((k) => obj[k] = Number(obj[k]) || 0);
        return obj as Omit<Product, "id">;
      });
      store.importProducts(rows);
      toast.success(`Imported ${rows.length} products`);
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Inventory</h1>
          <p className="text-sm text-muted-foreground">Manage products, batches, stock and expiry</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer">
            <input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files && importCSV(e.target.files[0])} />
            <Button variant="outline" size="sm" asChild><span><Upload className="mr-2 h-4 w-4" />Import CSV</span></Button>
          </label>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
          <Button size="sm" onClick={openNew}><Plus className="mr-2 h-4 w-4" />Add Product</Button>
        </div>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search by name, generic, NAFDAC, batch..." className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Select value={cat} onValueChange={setCat}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filter} onValueChange={(v) => setParams(v === "all" ? {} : { filter: v })}>
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All items</SelectItem>
                <SelectItem value="low">Low stock</SelectItem>
                <SelectItem value="near">Near expiry (≤6mo)</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Pack / Batch</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>Movement</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">No products found</TableCell></TableRow>
                )}
                {list.map((p) => {
                  const tier = expiryTier(p.expiry);
                  const days = daysUntil(p.expiry);
                  const low = p.quantity <= p.reorderLevel;
                  const sold30 = velocity.get(p.id) || 0;
                  const speed = movementSpeed(sold30);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.generic} · {p.category}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{p.packSize}</div>
                        <div className="text-muted-foreground">{p.batch}</div>
                        <div className="text-muted-foreground">NAFDAC: {p.nafdac}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={expiryBadgeClass(tier)}>
                          {format(new Date(p.expiry), "dd MMM yyyy")}
                        </Badge>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{days < 0 ? `${-days}d ago` : `${days}d left`}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={low ? "font-semibold text-warning" : ""}>{p.quantity}</span>
                        {low && <div className="text-[11px] text-muted-foreground">reorder ≥ {p.reorderLevel}</div>}
                        {p.lastRestocked && <div className="text-[11px] text-muted-foreground">restocked {format(new Date(p.lastRestocked), "dd MMM")}</div>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={movementBadgeClass(speed)}>{speed}</Badge>
                        <div className="text-[11px] text-muted-foreground">{sold30}/30d</div>
                      </TableCell>
                      <TableCell className="text-right">{NGN(p.costPrice)}</TableCell>
                      <TableCell className="text-right font-medium">{NGN(p.sellingPrice)}</TableCell>
                      <TableCell className="text-xs">{p.supplier}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => { setReceiveFor(p); setReceiveQty(p.reorderQuantity || 0); }}><PackagePlus className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => remove(p)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Edit Product" : "Add Product"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Product name" v={draft.name} on={(v) => setDraft({ ...draft, name: v })} />
            <Field label="Generic name" v={draft.generic} on={(v) => setDraft({ ...draft, generic: v })} />
            <Field label="NAFDAC No." v={draft.nafdac} on={(v) => setDraft({ ...draft, nafdac: v })} />
            <Field label="Batch / Lot No." v={draft.batch} on={(v) => setDraft({ ...draft, batch: v })} />
            <Field label="Expiry date" type="date" v={draft.expiry} on={(v) => setDraft({ ...draft, expiry: v })} />
            <Field label="Last restocked" type="date" v={draft.lastRestocked || ""} on={(v) => setDraft({ ...draft, lastRestocked: v })} />
            <div>
              <Label>Category</Label>
              <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v, controlled: v === "Controlled Substances" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Unit / Pack size</Label>
              <Select value={draft.packSize} onValueChange={(v) => setDraft({ ...draft, packSize: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PACK_SIZES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Field label="Quantity in stock" type="number" v={String(draft.quantity)} on={(v) => setDraft({ ...draft, quantity: +v })} />
            <Field label="Reorder level" type="number" v={String(draft.reorderLevel)} on={(v) => setDraft({ ...draft, reorderLevel: +v })} />
            <Field label="Reorder quantity" type="number" v={String(draft.reorderQuantity)} on={(v) => setDraft({ ...draft, reorderQuantity: +v })} />
            <Field label="Cost price (₦)" type="number" v={String(draft.costPrice)} on={(v) => setDraft({ ...draft, costPrice: +v })} />
            <Field label="Selling price (₦)" type="number" v={String(draft.sellingPrice)} on={(v) => setDraft({ ...draft, sellingPrice: +v })} />
            <div>
              <Label>Supplier</Label>
              <Select value={draft.supplierId || ""} onValueChange={(v) => setDraft({ ...draft, supplierId: v })}>
                <SelectTrigger><SelectValue placeholder={draft.supplier || "Select supplier"} /></SelectTrigger>
                <SelectContent>
                  {suppliers.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">Add suppliers first</div>}
                  {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Field label="Barcode (optional)" v={draft.barcode || ""} on={(v) => setDraft({ ...draft, barcode: v })} />
            <div className="col-span-2">
              <Label>Description</Label>
              <Textarea rows={2} value={draft.description || ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? "Save changes" : "Add product"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!receiveFor} onOpenChange={(o) => !o && setReceiveFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Receive stock — {receiveFor?.name}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Quantity received</Label>
            <Input type="number" value={receiveQty} onChange={(e) => setReceiveQty(+e.target.value)} />
            <div className="text-xs text-muted-foreground">Current: {receiveFor?.quantity} · New total: {(receiveFor?.quantity || 0) + receiveQty}</div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveFor(null)}>Cancel</Button>
            <Button onClick={() => { if (receiveFor && receiveQty > 0) { store.receiveStock(receiveFor.id, receiveQty); toast.success("Stock received"); setReceiveFor(null); } }}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, v, on, type = "text" }: { label: string; v: string; on: (v: string) => void; type?: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type={type} value={v} onChange={(e) => on(e.target.value)} />
    </div>
  );
}
