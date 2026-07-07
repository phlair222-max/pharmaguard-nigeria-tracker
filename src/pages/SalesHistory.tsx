import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore, store, usePlan } from "@/lib/store";
import { NGN } from "@/lib/format";
import { format, startOfDay } from "date-fns";
import { Search, Download, Eye, History, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function SalesHistory() {
  const sales = useStore((s) => s.sales);
  const extendedLoaded = useStore((s) => s.extendedSalesLoaded);
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pay, setPay] = useState("all");
  const [view, setView] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { tier, plan } = usePlan();

  const isPro = tier === "pro";
  const maxDays = plan?.maxSalesHistoryDays ?? 0;
  const buttonLabel = maxDays === -1 ? "Load all sales history" : `Load last ${maxDays} days`;

  const handleLoadExtended = async () => {
    setLoading(true);
    const result = await store.loadExtendedSalesHistory();
    setLoading(false);
    if (result.ok) {
      toast.success("Extended sales history loaded");
    } else {
      toast.error("Failed to load history: " + result.error);
    }
  };

  const list = useMemo(() => {
    return sales.filter((s) => {
      if (pay !== "all" && s.payment !== pay) return false;
      if (from) { if (new Date(s.createdAt).getTime() < startOfDay(new Date(from)).getTime()) return false; }
      if (to) { if (new Date(s.createdAt).getTime() >= startOfDay(new Date(to)).getTime() + 86400000) return false; }
      const t = q.trim().toLowerCase();
      if (!t) return true;
      return s.id.toLowerCase().includes(t)
        || (s.customer || "").toLowerCase().includes(t)
        || s.cashier.toLowerCase().includes(t)
        || s.items.some((it) => it.name.toLowerCase().includes(t));
    });
  }, [sales, q, from, to, pay]);

  const totals = list.reduce((a, s) => ({ rev: a.rev + s.total, profit: a.profit + s.profit }), { rev: 0, profit: 0 });

  const exportCSV = () => {
    const headers = ["receipt","date","customer","cashier","payment","items","total","profit"];
    const rows = list.map((s) => [
      s.id.slice(0, 8).toUpperCase(),
      format(new Date(s.createdAt), "yyyy-MM-dd HH:mm"),
      s.customer || "Walk-in",
      s.cashier, s.payment,
      s.items.map((it) => `${it.name} x${it.qty}`).join(" | "),
      s.total.toFixed(2), s.profit.toFixed(2),
    ].map((v) => JSON.stringify(v)).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `sales-${format(new Date(), "yyyy-MM-dd")}.csv`; a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Sales History</h1>
          <p className="text-sm text-muted-foreground">Browse, search and export every sale</p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
      </div>

      {/* Extended history banner — Pro only, hidden once loaded */}
      {isPro && !extendedLoaded && (
        <div className="flex items-center justify-between rounded-lg border border-dashed border-muted-foreground/40 bg-muted/30 px-4 py-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <History className="h-4 w-4 shrink-0" />
            <span>You are viewing the last 90 days. Your Pro plan includes full history.</span>
          </div>
          <Button size="sm" variant="outline" onClick={handleLoadExtended} disabled={loading}>
            {loading ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" />Loading...</> : buttonLabel}
          </Button>
        </div>
      )}

      {isPro && extendedLoaded && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-success/40 bg-success/5 px-4 py-2 text-xs text-success">
          <History className="h-3.5 w-3.5 shrink-0" />
          Full sales history loaded
        </div>
      )}

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Receipt, customer, cashier, item..."
                className="pl-8"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground whitespace-nowrap">
              <span>From</span>
              <Input type="date" className="w-[140px]" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground whitespace-nowrap">
              <span>To</span>
              <Input type="date" className="w-[140px]" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <Select value={pay} onValueChange={setPay}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Payment" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All payments</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="POS">POS</SelectItem>
                <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                <SelectItem value="Mobile Money">Mobile Money</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="mt-3 flex gap-3 text-sm">
            <Badge variant="outline" className="border-success text-success">Revenue: {NGN(totals.rev)}</Badge>
            <Badge variant="outline" className="border-info text-info">Profit: {NGN(totals.profit)}</Badge>
            <Badge variant="outline">{list.length} sales</Badge>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Cashier</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">No sales</TableCell></TableRow>
                )}
                {list.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="text-xs">{format(new Date(s.createdAt), "dd MMM yyyy HH:mm")}</TableCell>
                    <TableCell className="text-xs font-mono">{s.id.slice(0, 8).toUpperCase()}</TableCell>
                    <TableCell className="text-xs">{s.customer || "Walk-in"}</TableCell>
                    <TableCell className="text-xs">{s.cashier}</TableCell>
                    <TableCell>{s.items.length}</TableCell>
                    <TableCell className="text-right font-medium">{NGN(s.total)}</TableCell>
                    <TableCell className="text-right text-success">{NGN(s.profit)}</TableCell>
                    <TableCell><Badge variant="outline">{s.payment}</Badge></TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => setView(s)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Sale {view?.id.slice(0, 8).toUpperCase()}</DialogTitle></DialogHeader>
          {view && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                {format(new Date(view.createdAt), "dd MMM yyyy HH:mm")} · {view.payment} · Cashier: {view.cashier}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.items.map((it: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell>{it.name}</TableCell>
                      <TableCell className="text-right">{it.qty}</TableCell>
                      <TableCell className="text-right">{NGN(it.price)}</TableCell>
                      <TableCell className="text-right">{NGN(it.qty * it.price)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>Total</span><span>{NGN(view.total)}</span>
              </div>
              <div className="flex justify-between text-sm text-success">
                <span>Profit</span><span>{NGN(view.profit)}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
