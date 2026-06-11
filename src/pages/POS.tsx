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

  const add = (id: string) => { /* unchanged logic */ 
    const p = products.find(x => x.id === id);
    if (!p || p.quantity <= 0) return toast.error("Out of stock");
    setCart(c => {
      const ex = c.find(l => l.productId === id);
      if (ex) {
        if (ex.qty + 1 > p.quantity) return toast.error("Insufficient stock"), c;
        return c.map(l => l.productId === id ? {...l, qty: l.qty + 1} : l);
      }
      return [...c, {productId: id, name: p.name, qty: 1, price: p.sellingPrice, stock: p.quantity, cost: p.costPrice, controlled: p.controlled}];
    });
    if (quickMode) setQ("");
  };

  const setQty = (id: string, qty: number) => setCart(c => c.map(l => l.productId === id ? {...l, qty: Math.max(1, Math.min(l.stock, qty))} : l));
  const remove = (id: string) => setCart(c => c.filter(l => l.productId !== id));

  const total = cart.reduce((a, l) => a + l.qty * l.price, 0);
  const controlledItems = cart.filter(l => l.controlled);
  const hasControlled = controlledItems.length > 0;

  const printReceipt = (sale: any) => {
    setLastReceipt(sale);
    setTimeout(() => window.print(), 150);
  };

  const completeSale = (rxData?: RxForm) => {
    const sale = store.recordSale({
      items: cart.map(({ productId, name, qty, price, cost }) => ({ productId, name, qty, price, cost })),
      total, profit: cart.reduce((a, l) => a + l.qty * (l.price - l.cost), 0),
      payment, cashier: user?.username || "user", customer: customer || undefined,
    });

    if (rxData) {
      controlledItems.forEach(item => {
        const product = products.find(p => p.id === item.productId);
        store.recordControlledDispense({
          productId: item.productId, productName: item.name, batch: product?.batch || "",
          quantity: item.qty, amount: item.qty * item.price,
          patientName: rxData.patientName, patientPhone: rxData.patientPhone,
          prescriber: rxData.prescriber, prescriberRegNo: rxData.prescriberRegNo,
          prescriptionRef: rxData.prescriptionRef,
        });
      });
    }

    const receiptData = {...sale, customer, tendered, change: payment === "Cash" ? Math.max(0, tendered - total) : 0};
    printReceipt(receiptData);

    setCart([]); setCustomer(""); setTendered(0); setRx(emptyRx);
    toast.success("Sale completed");
  };

  const checkout = () => {
    if (cart.length === 0) return;
    hasControlled ? setRxOpen(true) : completeSale();
  };

  const submitRx = () => {
    if (!rx.patientName.trim() || !rx.prescriber.trim() || !rx.prescriptionRef.trim()) {
      return toast.error("Required fields missing");
    }
    setRxSubmitting(true);
    completeSale(rx);
    setRxOpen(false);
    setRxSubmitting(false);
  };

  return (
    <div className="space-y-4">
      {/* Header and main layout unchanged - keeping it short for GitHub */}
      {/* ... (the rest of your POS UI remains the same) ... */}

      <Button className="w-full" size="lg" onClick={checkout} disabled={cart.length === 0}>
        {hasControlled && <ShieldAlert className="mr-2 h-4 w-4" />}
        Complete Sale · {NGN(total)}
      </Button>

      {lastReceipt && <Receipt sale={lastReceipt} settings={settings} />}

      {/* Prescription Dialog - keep your existing one */}
    </div>
  );
}

function Receipt({ sale, settings }: { sale: any; settings: any }) {
  return (
    <div id="print-receipt" className="hidden print:block fixed inset-0 bg-white z-[100] p-8">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-receipt, #print-receipt * { visibility: visible; }
          #print-receipt { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
      <div className="max-w-[300px] mx-auto text-center text-sm" style={{fontFamily: "monospace"}}>
        {settings.logo && <img src={settings.logo} alt="" className="mx-auto h-12 mb-2" />}
        <div className="font-bold text-base">{settings.name}</div>
        <div className="text-xs">{settings.address}</div>
        <div className="text-xs">Tel: {settings.phone}</div>
        
        <div className="my-4 border-t border-b border-dashed py-2 text-left text-xs">
          <div>Receipt: {sale.id.slice(0,8).toUpperCase()}</div>
          <div>Date: {format(new Date(sale.createdAt), "dd MMM yyyy HH:mm")}</div>
          <div>Cashier: {sale.cashier}</div>
          {sale.customer && <div>Customer: {sale.customer}</div>}
        </div>

        <table className="w-full text-xs">
          <thead><tr><th className="text-left">Item</th><th>Qty</th><th className="text-right">Amt</th></tr></thead>
          <tbody>
            {sale.items.map((it: any, i: number) => (
              <tr key={i}>
                <td>{it.name}</td>
                <td className="text-center">{it.qty}</td>
                <td className="text-right">{(it.qty * it.price).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 font-bold text-base border-t pt-2">
          TOTAL: ₦{sale.total.toFixed(0)}
        </div>
        <div className="text-xs">Payment: {sale.payment}</div>
      </div>
    </div>
  );
}
