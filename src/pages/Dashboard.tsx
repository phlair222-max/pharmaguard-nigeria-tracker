import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import { NGN, num, expiryStatus } from "@/lib/format";
import { TrendingUp, Receipt, Wallet, AlertTriangle, PackageX, Pill, CalendarClock } from "lucide-react";
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

  const lowStock = products.filter((p) => p.quantity <= p.reorderLevel);
  const expiredCount = products.filter((p) => expiryStatus(p.expiry) === "expired").length;
  const near30 = products.filter((p) => { const s = expiryStatus(p.expiry); return s === "critical"; }).length;
  const near90 = products.filter((p) => { const s = expiryStatus(p.expiry); return s === "warning" || s === "critical"; }).length;

  // Sales trend last 7 days
  const trend = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const start = startOfDay(d).getTime();
    const end = start + 86400000;
    const day = sales.filter((s) => { const t = new Date(s.createdAt).getTime(); return t >= start && t < end; });
    return { day: format(d, "EEE"), revenue: day.reduce((a, s) => a + s.total, 0) };
  });

  // Top products
  const counter = new Map<string, { name: string; qty: number; revenue: number }>();
  sales.forEach((s) => s.items.forEach((it) => {
    const cur = counter.get(it.productId) || { name: it.name, qty: 0, revenue: 0 };
    cur.qty += it.qty; cur.revenue += it.qty * it.price;
    counter.set(it.productId, cur);
  }));
  const top = [...counter.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

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
        <Stat icon={Pill} label="Total Products" value={num(products.length)} accent="secondary" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <AlertCard icon={PackageX} label="Low stock" count={lowStock.length} tone="warning" link="/inventory?filter=low" hint="Below reorder level" />
        <AlertCard icon={CalendarClock} label="Expiring ≤30 days" count={near30} tone="destructive" link="/inventory?filter=critical" hint="Urgent action needed" />
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
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                  formatter={(v: number) => NGN(v)}
                />
                <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">Top Products</CardTitle></CardHeader>
          <CardContent className="h-[260px]">
            {top.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No sales yet</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top} layout="vertical" margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `₦${(v/1000).toFixed(0)}k`} />
                  <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: number) => NGN(v)} />
                  <Bar dataKey="revenue" fill="hsl(var(--secondary))" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {lowStock.length > 0 && (
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">Reorder suggestions</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2">
              {lowStock.slice(0, 8).map((p) => (
                <Link key={p.id} to="/inventory" className="flex items-center justify-between rounded-md border bg-card p-3 hover:bg-muted/50">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.generic} · {p.supplier}</div>
                  </div>
                  <Badge variant="outline" className="border-warning text-warning">{p.quantity} left</Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
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
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function AlertCard({ icon: Icon, label, count, tone, hint, link }: any) {
  const map: Record<string, string> = {
    warning: "border-warning/50 bg-warning/5 text-warning",
    destructive: "border-destructive/50 bg-destructive/5 text-destructive",
  };
  return (
    <Link to={link}>
      <Card className={`shadow-card transition hover:shadow-elevated ${map[tone]}`}>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <div className="text-sm font-medium text-foreground">{label}</div>
            <div className="text-xs text-muted-foreground">{hint}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{count}</span>
            <Icon className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
