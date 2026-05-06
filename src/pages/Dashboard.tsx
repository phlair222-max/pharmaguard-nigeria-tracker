import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useStore, salesVelocityMap, movementSpeed } from "@/lib/store";
import { NGN, num, expiryTier, expiryBadgeClass, daysUntil, movementBadgeClass } from "@/lib/format";
import { TrendingUp, Receipt, Wallet, AlertTriangle, PackageX, Pill, CalendarClock, Boxes, Banknote, Activity } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from "recharts";
import { format, startOfDay } from "date-fns";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const products = useStore((s) => s.products);
  const sales = useStore((s) => s.sales);

  const todayStart = startOfDay(new Date()).getTime();
  const todaySales = sales.filter((s) => new Date(s.createdAt).getTime() >= todayStart);
  const todayRevenue = todaySales.reduce((a, s) => a + s.total, 0);
  const todayProfit = todaySales.reduce((a, s) => a + s.profit, 0);

  // daily average — over the period since first sale (capped 30d)
  const last30Start = todayStart - 29 * 86400000;
  const last30 = sales.filter((s) => new Date(s.createdAt).getTime() >= last30Start);
  const distinctDays = Math.max(1, new Set(last30.map((s) => format(new Date(s.createdAt), "yyyy-MM-dd"))).size);
  const dailyAvg = last30.reduce((a, s) => a + s.total, 0) / distinctDays;

  const stockCostValue = products.reduce((a, p) => a + p.quantity * p.costPrice, 0);
  const stockSellValue = products.reduce((a, p) => a + p.quantity * p.sellingPrice, 0);

  const lowStock = products.filter((p) => p.quantity <= p.reorderLevel);
  const expiredCount = products.filter((p) => daysUntil(p.expiry) < 0).length;
  const near30 = products.filter((p) => { const d = daysUntil(p.expiry); return d >= 0 && d <= 30; });

  const trend = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const start = startOfDay(d).getTime();
    const end = start + 86400000;
    const day = sales.filter((s) => { const t = new Date(s.createdAt).getTime(); return t >= start && t < end; });
    return { day: format(d, "EEE"), revenue: day.reduce((a, s) => a + s.total, 0) };
  });

  const velocity = salesVelocityMap(sales, 30);
  const fastMovers = products
    .map((p) => ({ p, units: velocity.get(p.id) || 0 }))
    .filter((x) => x.units > 0)
    .sort((a, b) => b.units - a.units)
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Real-time overview of your pharmacy operations</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={Wallet} label="Today's Sales" value={NGN(todayRevenue)} accent="primary" />
        <Stat icon={TrendingUp} label="Today's Profit" value={NGN(todayProfit)} accent="success" />
        <Stat icon={Receipt} label="Transactions" value={num(todaySales.length)} accent="info" />
        <Stat icon={Activity} label="Daily Avg (30d)" value={NGN(dailyAvg)} accent="secondary" />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={Pill} label="Total Products" value={num(products.length)} accent="primary" />
        <Stat icon={Boxes} label="Stock Value (Cost)" value={NGN(stockCostValue)} accent="info" />
        <Stat icon={Banknote} label="Stock Value (Retail)" value={NGN(stockSellValue)} accent="success" />
        <Stat icon={TrendingUp} label="Potential Margin" value={NGN(stockSellValue - stockCostValue)} accent="secondary" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <AlertCard icon={PackageX} label="Low stock" count={lowStock.length} tone="warning" link="/inventory?filter=low" hint="At or below reorder level" />
        <AlertCard icon={CalendarClock} label="Expiring ≤30 days" count={near30.length} tone="destructive" link="/inventory?filter=near" hint="Urgent action needed" />
        <AlertCard icon={AlertTriangle} label="Expired items" count={expiredCount} tone="destructive" link="/inventory?filter=expired" hint="Quarantine immediately" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">Sales — Last 7 Days</CardTitle></CardHeader>
          <CardContent className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `₦${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: number) => NGN(v)} />
                <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">Top 10 Fast-Moving Drugs (30d)</CardTitle></CardHeader>
          <CardContent className="h-[260px]">
            {fastMovers.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No sales yet</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fastMovers.map((x) => ({ name: x.p.name, units: x.units }))} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={11} width={130} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="units" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">Near Expiry — Next 30 Days</CardTitle></CardHeader>
          <CardContent>
            {near30.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Nothing expiring soon 🎉</div>
            ) : (
              <div className="space-y-2">
                {near30.slice(0, 8).map((p) => {
                  const tier = expiryTier(p.expiry);
                  const d = daysUntil(p.expiry);
                  return (
                    <Link key={p.id} to="/inventory?filter=near" className="flex items-center justify-between rounded-md border p-2 hover:bg-muted/50">
                      <div>
                        <div className="text-sm font-medium">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground">Batch {p.batch} · qty {p.quantity}</div>
                      </div>
                      <Badge variant="outline" className={expiryBadgeClass(tier)}>{d < 0 ? `${-d}d ago` : `${d}d left`}</Badge>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">Low Stock — Reorder Suggestions</CardTitle></CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">All products are well stocked</div>
            ) : (
              <div className="space-y-2">
                {lowStock.slice(0, 8).map((p) => {
                  const speed = movementSpeed(velocity.get(p.id) || 0);
                  return (
                    <Link key={p.id} to="/inventory?filter=low" className="flex items-center justify-between rounded-md border p-2 hover:bg-muted/50">
                      <div>
                        <div className="text-sm font-medium">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground">{p.supplier} · order {p.reorderQuantity || p.reorderLevel * 3}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={movementBadgeClass(speed)}>{speed}</Badge>
                        <Badge variant="outline" className="border-warning text-warning">{p.quantity} left</Badge>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent }: { icon: any; label: string; value: string; accent: string }) {
  const map: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    info: "bg-info/10 text-info",
    secondary: "bg-secondary/10 text-secondary",
  };
  return (
    <Card className="shadow-card">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${map[accent]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="truncate text-lg font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function AlertCard({ icon: Icon, label, count, tone, hint, link }: any) {
  const map: Record<string, string> = {
    warning: "border-warning/50 bg-warning/5",
    destructive: "border-destructive/50 bg-destructive/5",
  };
  return (
    <Link to={link}>
      <Card className={`shadow-card transition hover:shadow-elevated ${map[tone]}`}>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <div className="text-sm font-medium text-foreground">{label}</div>
            <div className="text-xs text-muted-foreground">{hint}</div>
          </div>
          <div className={`flex items-center gap-2 ${tone === "warning" ? "text-warning" : "text-destructive"}`}>
            <span className="text-2xl font-bold">{count}</span>
            <Icon className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
