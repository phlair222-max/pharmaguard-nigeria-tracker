import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore, salesVelocityMap, movementSpeed, usePlan } from "@/lib/store";
import { NGN, num, expiryTier, expiryBadgeClass, daysUntil, movementBadgeClass } from "@/lib/format";
import { TrendingUp, Receipt, Wallet, AlertTriangle, PackageX, CalendarClock, Boxes, Banknote, Activity, Info, Flame, User, X, FileText, Loader2, Printer } from "lucide-react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from "recharts";
import { format, startOfDay } from "date-fns";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UpgradePrompt } from "@/components/UpgradePrompt";

const GRID_COLS_MD: Record<number, string> = {
  1: "md:grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-4",
};

// ── Expiry Banner ─────────────────────────────────────────────────────────────
type BannerTier = { label: string; count: number; tone: "red" | "amber" | "yellow"; key: string };

function ExpiryBanner({ tiers }: { tiers: BannerTier[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = tiers.filter((t) => !dismissed.has(t.key) && t.count > 0);
  if (visible.length === 0) return null;

  const styles: Record<string, string> = {
    red:    "border-destructive/60 bg-destructive/10 text-destructive",
    amber:  "border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    yellow: "border-yellow-500/60 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  };
  const iconStyles: Record<string, string> = {
    red:    "text-destructive",
    amber:  "text-amber-500",
    yellow: "text-yellow-500",
  };

  return (
    <div className="space-y-2">
      {visible.map((t) => (
        <div key={t.key} className={`flex items-center justify-between rounded-lg border px-4 py-3 ${styles[t.tone]}`}>
          <Link to="/inventory?filter=near" className="flex items-center gap-3 flex-1 min-w-0">
            <AlertTriangle className={`h-4 w-4 shrink-0 ${iconStyles[t.tone]}`} />
            <span className="text-sm font-medium">
              <span className="font-bold">{t.count} product{t.count !== 1 ? "s" : ""}</span>{" "}{t.label}
            </span>
            <span className="text-xs opacity-70 hidden sm:inline">— tap to review</span>
          </Link>
          <button
            onClick={() => setDismissed((prev) => new Set(prev).add(t.key))}
            className="ml-3 shrink-0 opacity-60 hover:opacity-100 transition-opacity"
            aria-label={`Dismiss ${t.label} alert`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── AI Disposal Report Card ───────────────────────────────────────────────────
function DisposalReportCard({ near30, settings }: { near30: any[]; settings: any }) {
  const plan = usePlan();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [refNo, setRefNo] = useState<string>("");

  const generate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-disposal-report", {
        body: {
          products: near30.map((p) => ({
            name: p.name, batch: p.batch, expiry: p.expiry,
            quantity: p.quantity, nafdac: p.nafdac,
          })),
          // Pass pharmacy details so they get filled in the report
          pharmacyName: settings.name || "Pharmacy Name",
          pharmacyAddress: settings.address || "Pharmacy Address",
          pharmacyPhone: settings.phone || "N/A",
          pharmacyEmail: settings.email || "",
          premiseLicense: settings.premiseLicense || "",
        },
      });
      if (error) throw error;
      setReport(data.report);
      if (data.refNo) setRefNo(data.refNo);
    } catch (e: any) {
      toast.error("Failed to generate report: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const print = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>NAFDAC Disposal Report ${refNo}</title>
        <style>
          /* FIX (misaligned printed table): this was "Times New Roman" — a
             proportional serif font — while the on-screen preview just
             above uses font-mono. A fixed-width, space-padded table only
             lines up in a monospace font; in a proportional font every
             character takes different width, so columns drift out of
             alignment. Now print matches what's already shown on screen. */
          body {
            font-family: "Courier New", Courier, monospace;
            font-size: 10.5pt;
            line-height: 1.5;
            margin: 2cm;
            color: #000;
          }
          pre {
            font-family: "Courier New", Courier, monospace;
            font-size: 10.5pt;
            white-space: pre-wrap;
            word-wrap: break-word;
            margin: 0;
          }
          @media print {
            body { margin: 1.5cm; }
          }
        </style>
      </head>
      <body>
        <pre>${report?.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
      </body>
      </html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  return (
    <Card className="shadow-card border-destructive/20">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-destructive" />
          AI Disposal Report
        </CardTitle>
        {plan.canAiForecast && near30.length > 0 && !report && (
          <button
            onClick={generate}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
            {loading ? "Generating…" : "Generate Report"}
          </button>
        )}
      </CardHeader>
      <CardContent>
        {!plan.canAiForecast ? (
          <UpgradePrompt
            feature="AI Disposal Report"
            requiredPlan="pro"
            description="One click generates a NAFDAC-formatted disposal report for products expiring within 30 days. Ready to print and sign."
          />
        ) : near30.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No products expiring within 30 days 🎉
          </div>
        ) : report ? (
          <div className="space-y-3">
            {/* Clean document preview */}
            <div className="rounded-lg border bg-white dark:bg-zinc-950 p-4 max-h-96 overflow-y-auto">
              <pre className="whitespace-pre-wrap text-xs leading-relaxed font-mono text-foreground">
                {report}
              </pre>
            </div>
            <div className="flex gap-2">
              <button
                onClick={print}
                className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary/10 border border-primary/30 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
              >
                <Printer className="h-3.5 w-3.5" /> Print Report
              </button>
              <button
                onClick={() => { setReport(null); setRefNo(""); }}
                className="rounded-md border px-3 py-2 text-xs text-muted-foreground hover:bg-muted transition-colors"
              >
                Clear
              </button>
            </div>
            {refNo && (
              <p className="text-[11px] text-muted-foreground text-center">Ref: {refNo}</p>
            )}
          </div>
        ) : (
          <div className="py-4 text-center space-y-1">
            <p className="text-sm text-muted-foreground">
              {near30.length} product{near30.length !== 1 ? "s" : ""} expiring within 30 days
            </p>
            <p className="text-xs text-muted-foreground">
              Click "Generate Report" above to create a NAFDAC-formatted disposal document
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const products = useStore((s) => s.products);
  const sales = useStore((s) => s.sales);
  const settings = useStore((s) => s.settings);
  const user = useStore((s) => s.user);

  const canSeeMargins =
    user?.memberRole === "Owner" ||
    (user?.memberRole === "Pharmacist" && !!user?.canViewMargins) ||
    (!user?.memberRole && user?.role === "Admin");

  const todayStart = startOfDay(new Date()).getTime();
  const todaySales = sales.filter((s) => new Date(s.createdAt).getTime() >= todayStart);
  const todayRevenue = todaySales.reduce((a, s) => a + s.total, 0);
  const todayProfit = todaySales.reduce((a, s) => a + s.profit, 0);

  const last30Start = todayStart - 29 * 86400000;
  const last30 = sales.filter((s) => new Date(s.createdAt).getTime() >= last30Start);
  const distinctDays = Math.max(1, new Set(last30.map((s) => format(new Date(s.createdAt), "yyyy-MM-dd"))).size);
  const dailyAvg = last30.reduce((a, s) => a + s.total, 0) / distinctDays;

  const stockCostValue = products.reduce((a, p) => a + p.quantity * (p.costPrice ?? 0), 0);
  const stockSellValue = products.reduce((a, p) => a + p.quantity * p.sellingPrice, 0);

  const lowStock = products.filter((p) => p.quantity <= p.reorderLevel);
  const expiredCount = products.filter((p) => daysUntil(p.expiry) < 0).length;

  const near30 = products.filter((p) => { const d = daysUntil(p.expiry); return d >= 0 && d <= 30; });
  const near60 = products.filter((p) => { const d = daysUntil(p.expiry); return d > 30 && d <= 60; });
  const near90 = products.filter((p) => { const d = daysUntil(p.expiry); return d > 60 && d <= 90; });

  const expiryBannerTiers: BannerTier[] = [
    { key: "red",    count: near30.length, tone: "red",    label: "expiring within 30 days — urgent action needed" },
    { key: "amber",  count: near60.length, tone: "amber",  label: "expiring within 31–60 days — plan disposal soon" },
    { key: "yellow", count: near90.length, tone: "yellow", label: "expiring within 61–90 days — monitor closely" },
  ];

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

  const topStats = [
    { key: "sales",  icon: Wallet,    label: "Today's Sales",            value: NGN(todayRevenue),      accent: "primary",   tip: "Total revenue collected today across all payment methods." },
    ...(canSeeMargins ? [{ key: "profit", icon: TrendingUp, label: "Today's Profit", value: NGN(todayProfit), accent: "success", tip: "Selling price minus cost price for items sold today." }] : []),
    { key: "txns",   icon: Receipt,   label: "Transactions",             value: num(todaySales.length), accent: "info",      tip: "Number of completed sales today." },
    { key: "avg",    icon: Activity,  label: "Daily Avg Sales (30 days)", value: NGN(dailyAvg),         accent: "secondary", tip: "Average daily revenue over the last 30 days." },
  ];

  const stockStats = [
    { key: "totalProducts", icon: Boxes,     label: "Total Products",      value: num(products.length),               accent: "primary",   tip: "Distinct SKUs currently in inventory." },
    ...(canSeeMargins ? [{ key: "stockCost", icon: Boxes, label: "Stock Value (Cost)", value: NGN(stockCostValue), accent: "info", tip: "Quantity × cost price for every product in stock." }] : []),
    { key: "stockRetail",   icon: Banknote,  label: "Stock Value (Retail)", value: NGN(stockSellValue),               accent: "success",   tip: "Quantity × selling price — what stock is worth at retail." },
    ...(canSeeMargins ? [{ key: "margin", icon: TrendingUp, label: "Potential Margin", value: NGN(stockSellValue - stockCostValue), accent: "secondary", tip: "Retail value minus cost value — profit if all stock sells." }] : []),
  ];

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          {settings.ownerPhoto ? (
            <img src={settings.ownerPhoto} alt="Pharmacist" className="h-12 w-12 rounded-full object-cover border shadow-sm shrink-0" />
          ) : (
            <div className="h-12 w-12 rounded-full bg-muted border flex items-center justify-center shrink-0">
              <User className="h-6 w-6 text-muted-foreground" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Dashboard</h1>
            <p className="text-sm text-muted-foreground">{settings.name} — Real-time overview</p>
          </div>
        </div>

        {/* Expiry banners */}
        <ExpiryBanner tiers={expiryBannerTiers} />

        {/* Top stats */}
        <div className={`grid grid-cols-2 gap-3 ${GRID_COLS_MD[topStats.length] || "md:grid-cols-4"}`}>
          {topStats.map((s) => <Stat key={s.key} icon={s.icon} label={s.label} value={s.value} accent={s.accent} tip={s.tip} />)}
        </div>

        {/* Stock stats */}
        <div className={`grid grid-cols-2 gap-3 ${GRID_COLS_MD[stockStats.length] || "md:grid-cols-4"}`}>
          {stockStats.map((s) => <Stat key={s.key} icon={s.icon} label={s.label} value={s.value} accent={s.accent} tip={s.tip} />)}
        </div>

        {/* Alert cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <AlertCard icon={PackageX}      label="Low Stock"         count={lowStock.length} tone="warning"     link="/inventory?filter=low"     hint="At or below reorder level" />
          <AlertCard icon={CalendarClock} label="Expiring ≤30 days" count={near30.length}   tone="red"         link="/inventory?filter=near"    hint="Urgent action needed" />
          <AlertCard icon={CalendarClock} label="Expiring ≤60 days" count={near60.length}   tone="amber"       link="/inventory?filter=near"    hint="Plan disposal soon" />
          <AlertCard icon={AlertTriangle} label="Expired Items"     count={expiredCount}    tone="destructive" link="/inventory?filter=expired" hint="Quarantine immediately" />
        </div>

        {/* Fast movers */}
        <Card className="shadow-card border-success/30">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="h-4 w-4 text-success" /> Fast Moving Products (Top 8 — last 30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {fastMovers.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No sales recorded yet</div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {fastMovers.slice(0, 8).map((x, i) => (
                  <Link key={x.p.id} to="/inventory" className="flex items-center justify-between rounded-md border bg-success/5 p-2 hover:bg-success/10">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-sm font-medium truncate"><span className="text-success">#{i + 1}</span> {x.p.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{x.p.generic}</div>
                    </div>
                    <Badge variant="outline" className="border-success bg-success/10 text-success ml-2 shrink-0">{x.units} sold</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">Sales — Last 7 Days</CardTitle></CardHeader>
            <CardContent className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `₦${(v / 1000).toFixed(0)}k`} />
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

        {/* Near Expiry + AI Disposal Report */}
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

          <DisposalReportCard near30={near30} settings={settings} />
        </div>

        {/* Low Stock */}
        <Card className="shadow-card">
          <CardHeader><CardTitle className="text-base">Low Stock — Reorder Suggestions</CardTitle></CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">All products are well stocked</div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
    </TooltipProvider>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Stat({ icon: Icon, label, value, accent, tip }: { icon: any; label: string; value: string; accent: string; tip?: string }) {
  const map: Record<string, string> = {
    primary:   "bg-primary/10 text-primary",
    success:   "bg-success/10 text-success",
    info:      "bg-info/10 text-info",
    secondary: "bg-secondary/10 text-secondary",
  };
  return (
    <Card className="shadow-card">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${map[accent]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="truncate">{label}</span>
            {tip && (
              <UITooltip>
                <TooltipTrigger asChild><Info className="h-3 w-3 cursor-help opacity-60 hover:opacity-100" /></TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">{tip}</TooltipContent>
              </UITooltip>
            )}
          </div>
          <div className="truncate text-lg font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function AlertCard({ icon: Icon, label, count, tone, hint, link }: any) {
  const cardMap: Record<string, string> = {
    warning:     "border-warning/50 bg-warning/5",
    red:         "border-destructive/50 bg-destructive/5",
    amber:       "border-amber-500/50 bg-amber-500/5",
    destructive: "border-destructive/50 bg-destructive/5",
  };
  const textMap: Record<string, string> = {
    warning:     "text-warning",
    red:         "text-destructive",
    amber:       "text-amber-500",
    destructive: "text-destructive",
  };
  return (
    <Link to={link}>
      <Card className={`shadow-card transition hover:shadow-elevated ${cardMap[tone]}`}>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <div className="text-sm font-medium text-foreground">{label}</div>
            <div className="text-xs text-muted-foreground">{hint}</div>
          </div>
          <div className={`flex items-center gap-2 ${textMap[tone]}`}>
            <span className="text-2xl font-bold">{count}</span>
            <Icon className="h-5 w-5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
