import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";
import { daysUntil } from "@/lib/format";
import { Sparkles, Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle, Package, Search, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { num } from "@/lib/format";
import { startOfDay, format } from "date-fns";
import { usePlan } from "@/lib/store";
import { UpgradePrompt } from "@/components/UpgradePrompt";

type Forecast = {
  id: string;
  name: string;
  generic: string;
  currentStock: number;
  predictedUnits14d: number;
  avgDailyDemand: number;
  trend: "rising" | "stable" | "falling" | "no-data";
  daysOfStock: number;
  urgency: "urgent" | "soon" | "ok";
  suggestedReorderQty: number;
  reason: string;
  hasSalesData: boolean;
  expiryFlag: "expired" | "expiring-soon" | null;
};

function urgencyRank(u: string) { return u === "urgent" ? 0 : u === "soon" ? 1 : 2; }

function TrendBadge({ trend }: { trend: string }) {
  if (trend === "rising") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success border border-success/30">
      <TrendingUp className="h-3 w-3" /> Rising
    </span>
  );
  if (trend === "falling") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground border border-border">
      <TrendingDown className="h-3 w-3" /> Falling
    </span>
  );
  if (trend === "no-data") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground/60 border border-border/50">
      <Minus className="h-3 w-3" /> No data
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-info/10 px-2 py-0.5 text-[11px] font-medium text-info border border-info/30">
      <Minus className="h-3 w-3" /> Stable
    </span>
  );
}

function UrgencyPill({ urgency, expiryFlag }: { urgency: string; expiryFlag: "expired" | "expiring-soon" | null }) {
  if (expiryFlag === "expired") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2.5 py-1 text-[11px] font-semibold text-destructive border border-destructive/30">
      <ShieldAlert className="h-3 w-3" /> Expired
    </span>
  );
  if (expiryFlag === "expiring-soon") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-[11px] font-semibold text-warning border border-warning/30">
      <AlertTriangle className="h-3 w-3" /> Expiring
    </span>
  );
  if (urgency === "urgent") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2.5 py-1 text-[11px] font-semibold text-destructive border border-destructive/30">
      <AlertTriangle className="h-3 w-3" /> Urgent
    </span>
  );
  if (urgency === "soon") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2.5 py-1 text-[11px] font-semibold text-warning border border-warning/30">
      Soon
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success border border-success/30">
      OK
    </span>
  );
}

export default function Forecast() {
  const products = useStore((s) => s.products);
  const sales = useStore((s) => s.sales);
  const [loading, setLoading] = useState(false);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState<"all" | "urgent" | "soon" | "ok">("all");

  const payload = useMemo(() => {
    const today = startOfDay(new Date()).getTime();
    const dayKeys: string[] = Array.from({ length: 30 }).map((_, i) => {
      const d = new Date(today - (29 - i) * 86400000);
      return format(d, "yyyy-MM-dd");
    });

    const perProduct = new Map<string, Map<string, number>>();
    for (const s of sales) {
      const t = new Date(s.createdAt).getTime();
      if (t < today - 29 * 86400000) continue;
      const k = format(new Date(s.createdAt), "yyyy-MM-dd");
      for (const it of s.items) {
        if (!perProduct.has(it.productId)) perProduct.set(it.productId, new Map());
        const m = perProduct.get(it.productId)!;
        m.set(k, (m.get(k) || 0) + it.qty);
      }
    }

    return products.map((p) => {
      const m = perProduct.get(p.id);
      const daily = dayKeys.map((k) => m?.get(k) || 0);
      const total = daily.reduce((a, b) => a + b, 0);
      return {
        id: p.id,
        name: p.name,
        generic: p.generic,
        quantity: p.quantity,
        reorderLevel: p.reorderLevel,
        reorderQuantity: p.reorderQuantity,
        expiry: p.expiry,
        daily,
        hasSalesData: total > 0,
      };
    });
  }, [products, sales]);

  const computeForecasts = (): Forecast[] => {
    return payload.map((p) => {
      const d = p.expiry ? daysUntil(p.expiry) : null;

      // ── Expiry overrides everything ───────────────────────────────────
      // Expired stock physically cannot be sold — treat as zero sellable
      // stock regardless of quantity on shelf.
      if (d !== null && d < 0) {
        return {
          id: p.id,
          name: p.name,
          generic: p.generic,
          currentStock: p.quantity,
          predictedUnits14d: 0,
          avgDailyDemand: 0,
          trend: "no-data",
          daysOfStock: 0,
          urgency: "urgent",
          suggestedReorderQty: p.reorderQuantity || p.reorderLevel * 3,
          reason: `Stock expired ${Math.abs(d)} day(s) ago. Quarantine and remove from inventory immediately. Restock with fresh batch.`,
          hasSalesData: false,
          expiryFlag: "expired",
        };
      }

      // Expiring within 30 days — flag but still run demand analysis
      const expiryFlag: Forecast["expiryFlag"] = (d !== null && d <= 30) ? "expiring-soon" : null;

      const daily = p.daily;
      const n = daily.length;
      const total = daily.reduce((a, b) => a + b, 0);

      // ── No sales data ─────────────────────────────────────────────────
      if (!p.hasSalesData) {
        const isLowStock = p.quantity <= p.reorderLevel;
        const urgency: Forecast["urgency"] = expiryFlag === "expiring-soon" ? "soon" : isLowStock ? "soon" : "ok";
        return {
          id: p.id,
          name: p.name,
          generic: p.generic,
          currentStock: p.quantity,
          predictedUnits14d: 0,
          avgDailyDemand: 0,
          trend: "no-data",
          daysOfStock: Infinity,
          urgency,
          suggestedReorderQty: urgency !== "ok" ? (p.reorderQuantity || p.reorderLevel * 3) : 0,
          reason: expiryFlag === "expiring-soon"
            ? `No sales in last 30 days but stock expires in ${d} day(s). Sell or return remaining ${p.quantity} units urgently.`
            : isLowStock
            ? `No sales in last 30 days but stock is at or below reorder level (${p.quantity} remaining). Consider restocking.`
            : `No sales recorded in the last 30 days. Stock appears sufficient (${p.quantity} units).`,
          hasSalesData: false,
          expiryFlag,
        };
      }

      // ── Normal demand analysis ────────────────────────────────────────
      const half = Math.floor(n / 2);
      const firstHalf = daily.slice(0, half);
      const secondHalf = daily.slice(half);
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / Math.max(1, firstHalf.length);
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / Math.max(1, secondHalf.length);
      const overallAvg = total / n;
      const halfDiff = secondAvg - firstAvg;

      let trend: Forecast["trend"] = "stable";
      const meaningfulVolume = total >= 6;
      const significantShift = Math.abs(halfDiff) >= Math.max(0.3, overallAvg * 0.3);
      if (meaningfulVolume && significantShift) trend = halfDiff > 0 ? "rising" : "falling";

      const rawPct = firstAvg > 0 ? (halfDiff / firstAvg) * 100 : (secondAvg > 0 ? 100 : 0);
      const pctChange = Math.max(-95, Math.min(200, rawPct));

      const weightedDailyDemand = secondAvg * 0.6 + overallAvg * 0.4;
      const trendFactor = trend === "rising" ? 1.15 : trend === "falling" ? 0.85 : 1;
      const predictedUnits14d = weightedDailyDemand * 14 * trendFactor;
      const safeDailyDemand = Math.max(weightedDailyDemand, 0.01);

      // If expiring soon, cap days-of-stock at remaining days before expiry
      // so we don't say "216 days of stock" when product expires in 20 days.
      const rawDaysOfStock = p.quantity / safeDailyDemand;
      const daysOfStock = expiryFlag === "expiring-soon" && d !== null
        ? Math.min(rawDaysOfStock, d)
        : rawDaysOfStock;

      let urgency: Forecast["urgency"] = "ok";
      if (daysOfStock <= 5) urgency = "urgent";
      else if (daysOfStock <= 14 || expiryFlag === "expiring-soon") urgency = "soon";

      const projectedNeed = Math.max(0, predictedUnits14d * 1.2 - p.quantity);
      const suggestedReorderQty = urgency === "ok" ? 0 : Math.max(Math.round(projectedNeed), p.reorderQuantity || 0);

      const trendPhrase = trend === "rising"
        ? `Sales up ${Math.round(Math.abs(pctChange))}% over last 2 weeks.`
        : trend === "falling"
        ? `Sales down ${Math.round(Math.abs(pctChange))}% over last 2 weeks.`
        : `Sales steady over last 30 days.`;

      const stockPhrase = expiryFlag === "expiring-soon"
        ? `Expires in ${d} day(s) — sell remaining ${p.quantity} units before then or arrange return.`
        : daysOfStock <= 5
        ? `Runs out in ~${Math.max(0, Math.round(daysOfStock))} day(s) — reorder now.`
        : daysOfStock <= 14
        ? `~${Math.round(daysOfStock)} days of stock left — reorder soon.`
        : `~${Math.round(daysOfStock)} days of stock remaining.`;

      return {
        id: p.id,
        name: p.name,
        generic: p.generic,
        currentStock: p.quantity,
        predictedUnits14d,
        avgDailyDemand: weightedDailyDemand,
        trend,
        daysOfStock,
        urgency,
        suggestedReorderQty,
        reason: `${trendPhrase} ${stockPhrase}`,
        hasSalesData: true,
        expiryFlag,
      };
    });
  };

  const runForecast = async () => {
    if (payload.length === 0) { toast.error("No products found in inventory"); return; }
    setLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 350));
      const results = computeForecasts();
      setForecasts(results);
      setGeneratedAt(new Date().toISOString());
      toast.success(`Forecast generated for ${results.length} products`);
    } catch (e: any) {
      toast.error(e?.message || "Forecast failed");
    } finally {
      setLoading(false);
    }
  };

  const urgentCount = forecasts.filter((f) => f.urgency === "urgent").length;
  const soonCount = forecasts.filter((f) => f.urgency === "soon").length;
  const okCount = forecasts.filter((f) => f.urgency === "ok").length;

  const filtered = forecasts
    .filter((f) => {
      if (urgencyFilter !== "all" && f.urgency !== urgencyFilter) return false;
      if (search.trim()) {
        const t = search.trim().toLowerCase();
        return f.name.toLowerCase().includes(t) || f.generic.toLowerCase().includes(t);
      }
      return true;
    })
    .sort((a, b) =>
      a.urgency === b.urgency ? b.predictedUnits14d - a.predictedUnits14d : urgencyRank(a.urgency) - urgencyRank(b.urgency)
    );

  const plan = usePlan();
  if (!plan.canAiForecast) return (
    <div className="p-6">
      <UpgradePrompt feature="AI Forecast" requiredPlan="pro" description="Get AI-powered demand forecasting and stock predictions. Know what to restock before you run out." />
    </div>
  );

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
            <Sparkles className="h-6 w-6 text-primary" /> Demand Forecast
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            14-day demand prediction across all {products.length} products — based on last 30 days of sales.
          </p>
        </div>
        <Button onClick={runForecast} disabled={loading} size="lg" className="w-full gap-2 sm:w-auto">
          {loading
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing…</>
            : forecasts.length > 0
            ? <><RefreshCw className="h-4 w-4" /> Regenerate</>
            : <><Sparkles className="h-4 w-4" /> Generate Forecast</>}
        </Button>
      </div>

      {/* ── Summary stat cards ── */}
      <div className="grid grid-cols-3 gap-3">
        <button
          onClick={() => setUrgencyFilter(urgencyFilter === "urgent" ? "all" : "urgent")}
          className={`rounded-xl border p-4 text-left transition hover:opacity-90 ${urgencyFilter === "urgent" ? "ring-2 ring-destructive" : ""} ${urgentCount > 0 ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"}`}
        >
          <div className="text-3xl font-bold text-destructive">{urgentCount}</div>
          <div className="mt-1 text-xs font-semibold text-destructive/80">Urgent Restock</div>
          <div className="text-[11px] text-muted-foreground">≤ 5 days or expired</div>
        </button>

        <button
          onClick={() => setUrgencyFilter(urgencyFilter === "soon" ? "all" : "soon")}
          className={`rounded-xl border p-4 text-left transition hover:opacity-90 ${urgencyFilter === "soon" ? "ring-2 ring-warning" : ""} ${soonCount > 0 ? "border-warning/40 bg-warning/5" : "border-border bg-card"}`}
        >
          <div className="text-3xl font-bold text-warning">{soonCount}</div>
          <div className="mt-1 text-xs font-semibold text-warning/80">Order Soon</div>
          <div className="text-[11px] text-muted-foreground">6–14 days or expiring</div>
        </button>

        <button
          onClick={() => setUrgencyFilter(urgencyFilter === "ok" ? "all" : "ok")}
          className={`rounded-xl border p-4 text-left transition hover:opacity-90 ${urgencyFilter === "ok" ? "ring-2 ring-success" : ""} border-success/30 bg-success/5`}
        >
          <div className="text-3xl font-bold text-success">{okCount}</div>
          <div className="mt-1 text-xs font-semibold text-success/80">Well Stocked</div>
          <div className="text-[11px] text-muted-foreground">15+ days of stock</div>
        </button>
      </div>

      {/* ── Product breakdown ── */}
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Product Breakdown</CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {generatedAt && <span>Generated {format(new Date(generatedAt), "dd MMM yyyy, h:mm a")}</span>}
              {forecasts.length > 0 && <Badge variant="outline">{filtered.length} / {forecasts.length} products</Badge>}
            </div>
          </div>
          {forecasts.length > 0 && (
            <div className="relative mt-2">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search product or generic name…"
                className="pl-8 h-8 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {forecasts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="rounded-full bg-primary/10 p-4">
                <Sparkles className="h-8 w-8 text-primary/60" />
              </div>
              <div>
                <p className="font-medium text-sm">No forecast generated yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {loading ? "Analyzing sales patterns…" : "Click \"Generate Forecast\" to predict demand for all your products over the next 14 days."}
                </p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No products match your filter.</div>
          ) : (
            <>
              {/* MOBILE: card list */}
              <div className="divide-y sm:hidden">
                {filtered.map((f) => (
                  <div key={f.id} className={`p-4 space-y-3 ${f.urgency === "urgent" ? "bg-destructive/5" : f.urgency === "soon" ? "bg-warning/5" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-sm">{f.name}</div>
                        <div className="text-[11px] text-muted-foreground">{f.generic}</div>
                      </div>
                      <UrgencyPill urgency={f.urgency} expiryFlag={f.expiryFlag} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Stock", value: num(f.currentStock) },
                        { label: "Next 14d", value: f.hasSalesData ? num(Math.round(f.predictedUnits14d)) : "—" },
                        { label: "Days Left", value: f.daysOfStock === Infinity ? "∞" : f.daysOfStock === 0 ? "0" : `${Math.round(f.daysOfStock)}d` },
                      ].map(({ label, value }) => (
                        <div key={label} className="rounded-lg bg-muted/40 p-2 text-center">
                          <div className="text-[10px] text-muted-foreground">{label}</div>
                          <div className="text-sm font-semibold">{value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <TrendBadge trend={f.trend} />
                      {f.suggestedReorderQty > 0
                        ? <span className="text-xs text-muted-foreground">Reorder: <span className="font-semibold text-foreground">{num(Math.round(f.suggestedReorderQty))} units</span></span>
                        : <span className="text-xs text-muted-foreground">No reorder needed</span>}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{f.reason}</p>
                  </div>
                ))}
              </div>

              {/* DESKTOP: table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Product</th>
                      <th className="px-4 py-3 font-medium text-right">Stock</th>
                      <th className="px-4 py-3 font-medium text-right">Avg/Day</th>
                      <th className="px-4 py-3 font-medium text-right">Next 14d</th>
                      <th className="px-4 py-3 font-medium">Trend</th>
                      <th className="px-4 py-3 font-medium text-right">Days Left</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium text-right">Reorder Qty</th>
                      <th className="px-4 py-3 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((f) => (
                      <tr
                        key={f.id}
                        className={`transition-colors hover:bg-muted/20 ${
                          f.urgency === "urgent"
                            ? "bg-destructive/5 hover:bg-destructive/10"
                            : f.urgency === "soon"
                            ? "bg-warning/5 hover:bg-warning/10"
                            : ""
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium leading-tight">{f.name}</div>
                          <div className="text-[11px] text-muted-foreground">{f.generic}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">{num(f.currentStock)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                          {f.hasSalesData ? f.avgDailyDemand.toFixed(1) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                          {f.hasSalesData ? num(Math.round(f.predictedUnits14d)) : "—"}
                        </td>
                        <td className="px-4 py-3"><TrendBadge trend={f.trend} /></td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium">
                          {f.daysOfStock === Infinity
                            ? <span className="text-muted-foreground">∞</span>
                            : f.daysOfStock === 0
                            ? <span className="text-destructive font-bold">0</span>
                            : `${Math.round(f.daysOfStock)}d`}
                        </td>
                        <td className="px-4 py-3">
                          <UrgencyPill urgency={f.urgency} expiryFlag={f.expiryFlag} />
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">
                          {f.suggestedReorderQty > 0 ? num(Math.round(f.suggestedReorderQty)) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 max-w-[260px] text-xs text-muted-foreground leading-relaxed">{f.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Forecasts are based on weighted moving average + trend analysis from your last 30 days of sales. Expired products are flagged regardless of stock quantity. Review against seasonality, promotions, and supplier lead times before ordering.
      </p>
    </div>
  );
}
