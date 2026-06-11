import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, Plus, Minus, Trash2, ShoppingCart, Zap, ShieldAlert } from "lucide-react";
import { store, useStore, SaleItem } from "@/lib/store";
import { NGN, expiryStatus } from "@/lib/format";
import { toast } from "sonner";
import { format } from "date-fns";

type CartLine = SaleItem & { stock: number; cost: number; controlled?: boolean };

type RxForm = {
  patientName: string;
  patientPhone: string;
  prescriber: string;
  prescriberRegNo: string;
  prescriptionRef: string;
};

const emptyRx: RxForm = {
  patientName: "", patientPhone: "", prescriber: "", prescriberRegNo: "", prescriptionRef: "",
};

export default function POS() {
  const products = useStore((s) => s.products);
  const user = useStore((s) => s.user);
  const settings = useStore((s) => s.settings);

  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<"Cash" | "POS" | "Bank Transfer" | "Mobile Money">("Cash");
  const [customer, setCustomer] = useState("");
  const [tendered, setTendered] = useState(0);
  const [lastReceipt, setLastReceipt] = useState<any>(null);
  const [quickMode, setQuickMode] = useState(false);

  const [rxOpen, setRxOpen] = useState(false);
  const [rx, setRx] = useState<RxForm>(emptyRx);
  const [rxSubmitting, setRxSubmitting] = useState(false);
  const [tab, setTab] = useState<"all" | "controlled" | "lowstock">("all");

  const controlledCount = products.filter((p) => p.controlled).length;
  const lowStockCount = products.filter((p) => p.quantity <= p.reorderLevel && p.quantity > 0).length;

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    let pool = products;
    if (tab === "controlled") pool = products.filter(p => p.controlled);
    else if (tab === "lowstock") pool = products.filter(p => p.quantity <= p.reorderLevel && p.quantity > 0);
    if (!term) return pool.slice(0, tab === "all" ? 8 : 50);
    return pool.filter(p =>
      p.name.toLowerCase().includes(term) || p.generic.toLowerCase().includes(term) ||
      p.barcode === term || p.nafdac.toLowerCase().includes(term)
    ).slice(0, 12);
  }, [q, products, tab]);

  const add = (id: string) => {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    if (p.quantity <= 0) return toast.error("Out of stock");
    setCart((c) => {
      const ex = c.find((l) => l.productId === id);
      if (ex) {
        if (ex.qty + 1 > p.quantity) return toast.error("Insufficient stock"), c;
        return c.map((l) => l.productId === id ? { ...l, qty: l.qty + 1 } : l);
      }
      return [...c, {
        productId: id, name: p.name, qty: 1, price: p.sellingPrice,
        stock: p.quantity, cost: p.costPrice, controlled: p.controlled
      }];
    });
    if (quickMode) setQ("");
  };

  const setQty = (id: string, qty: number) =>
    setCart((c) => c.map((l) => l.productId === id ? { ...l, qty: Math.max(1, Math.min(l.stock, qty)) } : l));

  const remove = (id: string) => setCart((c) => c.filter((l) => l.productId !== id));

  const total = cart.reduce((a, l) => a + l.qty * l.price, 0);
  const profit = cart.reduce((a, l) => a + l.qty * (l.price - l.cost), 0);
  const change = payment === "Cash" ? Math.max(0, tendered - total) : 0;

  const controlledItems = cart.filter((l) => l.controlled);
  const hasControlled = controlledItems.length > 0;

  const printReceipt = (sale: any) => {
    setLastReceipt(sale);
    setTimeout(() => window.print(), 150);
  };

  const completeSale = (rxData?: RxForm) => {
    const sale = store.recordSale({
      items: cart.map(({ productId, name, qty, price, cost }) => ({ productId, name, qty, price, cost })),
      total, profit, payment,
      cashier: user?.username || "user",
      customer: customer || undefined,
    });

    if (rxData) {
      controlledItems.forEach((item) => {
        const product = products.find((p) => p.id === item.productId);
        store.recordControlledDispense({
          productId: item.productId,
          productName: item.name,
          batch: product?.batch || "",
          quantity: item.qty,
          amount: item.qty * item.price,
          patientName: rxData.patientName,
          patientPhone: rxData.patientPhone,
          prescriber: rxData.prescriber,
          prescriberRegNo: rxData.prescriberRegNo,
          prescriptionRef: rxData.prescriptionRef,
        });
      });
    }

    const receiptData = { ...sale, customer, tendered, change };
    printReceipt(receiptData);

    setCart([]);
    setCustomer("");
    setTendered(0);
    setRx(emptyRx);
    toast.success("Sale completed successfully");
  };

  const checkout = () => {
    if (cart.length === 0) return;
    if (hasControlled) {
      setRxOpen(true);
    } else {
      completeSale();
    }
  };

  const submitRx = () => {
    if (!rx.patientName.trim() || !rx.prescriber.trim() || !rx.prescriptionRef.trim()) {
      return toast.error("Patient name, prescriber and Rx ref are required");
    }
    setRxSubmitting(true);
    completeSale(rx);
    setRxOpen(false);
    setRxSubmitting(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Sales Counter</h1>
          <p className="text-sm text-muted-foreground">Fast point-of-sale for the pharmacy counter</p>
        </div>
        <Button size="sm" onClick={() => setQuickMode(v => !v)} variant={quickMode ? "default" : "outline"}>
          <Zap className="mr-2 h-4 w-4" /> Quick Sale {quickMode ? "ON" : "OFF"}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Products */}
        <div className="space-y-3 lg:col-span-3">
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input autoFocus placeholder="Search product / scan barcode..." className="h-11 pl-9 text-base" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setTab("all")} className={`px-4 py-1.5 rounded-md text-sm ${tab === "all" ? "bg-primary text-white" : "bg-muted"}`}>All</button>
                <button onClick={() => setTab("controlled")} className={`px-4 py-1.5 rounded-md text-sm flex items-center gap-1 ${tab === "controlled" ? "bg-destructive text-white" : "bg-muted"}`}>
                  <ShieldAlert className="h-4 w-4" /> Controlled
                </button>
                <button onClick={() => setTab("lowstock")} className={`px-4 py-1.5 rounded-md text-sm ${tab === "lowstock" ? "bg-warning text-white" : "bg-muted"}`}>Low Stock</button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {results.map((p) => {
                  const status = expiryStatus(p.expiry);
                  return (
                    <button key={p.id} onClick={() => add(p.id)} disabled={p.quantity <= 0} className="text-left border rounded-lg p-3 hover:border-primary transition disabled:opacity-50">
                      <div className="font-medium line-clamp-1">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.generic}</div>
                      <div className="mt-2 flex justify-between items-center">
                        <span className="font-semibold text-primary">{NGN(p.sellingPrice)}</span>
                        <Badge variant="outline">{p.quantity}</Badge>
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cart */}
        <Card className="lg:col-span-2 shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShoppingCart className="h-5 w-5" /> Cart ({cart.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-80 overflow-auto space-y-2">
              {cart.length === 0 && <p className="text-center py-8 text-muted-foreground">Cart is empty</p>}
              {cart.map((l) => (
                <div key={l.productId} className="flex items-center gap-3 border p-3 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">{l.name}</div>
                    <div className="text-sm text-muted-foreground">{NGN(l.price)} × {l.qty}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setQty(l.productId, l.qty - 1)}><Minus className="h-3 w-3" /></Button>
                    <Input className="w-12 text-center" value={l.qty} onChange={e => setQty(l.productId, +e.target.value)} />
                    <Button size="sm" variant="outline" onClick={() => setQty(l.productId, l.qty + 1)}><Plus className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(l.productId)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between text-lg font-bold">
                <span>Total</span>
                <span>{NGN(total)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <Label>Payment Method</Label>
                <Select value={payment} onValueChange={(v: any) => setPayment(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="POS">POS</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {payment === "Cash" && (
                <div>
                  <Label>Cash Tendered</Label>
                  <Input type="number" value={tendered} onChange={e => setTendered(+e.target.value)} />
                </div>
              )}
              <div>
                <Label>Customer (optional)</Label>
                <Input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Walk-in" />
              </div>
            </div>

            <Button onClick={checkout} className="w-full" size="lg" disabled={cart.length === 0}>
              Complete Sale • {NGN(total)}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Printable Receipt */}
      {lastReceipt && <Receipt sale={lastReceipt} settings={settings} />}

      {/* Prescription Modal */}
      <Dialog open={rxOpen} onOpenChange={setRxOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Prescription Required</DialogTitle>
          </DialogHeader>
          {/* Add your full Rx form here if needed - keeping minimal for now */}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRxOpen(false)}>Cancel</Button>
            <Button onClick={submitRx}>Confirm Dispense</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Receipt({ sale, settings }: { sale: any; settings: any }) {
  return (
    <div id="print-receipt" className="hidden print:block fixed inset-0 bg-white z-[9999] p-6">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-receipt, #print-receipt * { visibility: visible; }
        }
      `}</style>
      <div className="max-w-[320px] mx-auto text-sm">
        {settings.logo && <img src={settings.logo} alt="logo" className="mx-auto h-16 mb-2" />}
        <div className="text-center font-bold text-lg">{settings.name}</div>
        <div className="text-center text-xs">{settings.address}</div>
        <div className="text-center text-xs">Tel: {settings.phone}</div>

        <div className="my-4 border-t border-b py-2 text-xs">
          <div>Receipt: {sale.id?.slice(0,8).toUpperCase()}</div>
          <div>Date: {format(new Date(sale.createdAt), "dd MMM yyyy HH:mm")}</div>
        </div>

        <table className="w-full text-xs">
          <thead><tr><th className="text-left">Item</th><th>Qty</th><th className="text-right">Price</th></tr></thead>
          <tbody>
            {sale.items?.map((it: any, i: number) => (
              <tr key={i}>
                <td>{it.name}</td>
                <td className="text-center">{it.qty}</td>
                <td className="text-right">{(it.qty * it.price).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 font-bold text-lg border-t pt-3 text-center">
          TOTAL: ₦{sale.total}
        </div>
      </div>
    </div>
  );
}
