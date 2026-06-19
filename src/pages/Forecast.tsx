import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStore } from "@/lib/store";
import { Sparkles, Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle, Package } from "lucide-react";
import { toast } from "sonner";
import { num } from "@/lib/format";
import { startOfDay, format } from "date-fns";

type Forecast = {
  id: string;
  name: string;
  predictedUnits14d: number;
  avgDailyDemand: number;
  trend: "rising" | "stable" | "falling";
  daysOfStock: number;
  urgency: "urgent" | "soon" | "ok";
  suggestedReorderQty: number;
  reason: string;
};

export default function Forecast() {
  const products = useStore((s) => s.products);
  const sales = useStore((s) => s.sales);
  const [loading, setLoading] = useState(false);
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);

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

    return products
      .map((p) => {
        const m = perProduct.get(p.id);
        const daily = dayKeys.map((k) => m?.get(k) || 0);
        const total = daily.reduce((a, b) => a + b, 0);
        return { id: p.id, name: p.name, generic: p.generic, quantity: p.quantity, reorderLevel: p.reorderLevel, reorderQuantity: p.reorderQuantity, daily, _total: total };
      })
      .filter((p) => p._total > 0)
      .sort((a, b) => b._total - a._total)
      .slice(0, 60)
      .map(({ _total, ...rest }) => rest);
  }, [products, sales]);

  const computeForecasts = (): Forecast[] => {
    return payload.map((p) => {
      const daily = p.daily;
      const n = daily.length;
      const half = Math.floor(n / 2);
      const firstHalf = daily.slice(0, half);
      const secondHalf = daily.slice(half);
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / Math.max(1, firstHalf.length);
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / Math.max(1, secondHalf.length);
      const overallAvg = daily.reduce((a, b) => a + b, 0) / n;
      const halfDiff = secondAvg - firstAvg;
      const totalUnits = daily.reduce((a, b) => a + b, 0);
      let trend: Forecast["trend"] = "stable";
      const meaningfulVolume = totalUnits >= 6;
      const significantShift = Math.abs(halfDiff) >= Math.max(0.3, overallAvg * 0.3);
      if (meaningfulVolume && significantShift) trend = halfDiff > 0 ? "rising" : "falling";
      const rawPct = firstAvg > 0 ? (halfDiff / firstAvg) * 100 : (secondAvg > 0 ? 100 : 0);
      const pctChange = Math.max(-95, Math.min(200, rawPct));
      const weightedDailyDemand = secondAvg * 0.6 + overallAvg * 0.4;
      const trendFactor = trend === "rising" ? 1.15 : trend === "falling" ? 0.85 : 1;
      const predictedUnits14d = weightedDailyDemand * 14 * trendFactor;
      const safeDailyDemand = Math.max(weightedDailyDemand, 0.01);
      const daysOfStock = p.quantity / safeDailyDemand;
      let urgency: Forecast["urgency"] = "ok";
      if (daysOfStock <= 5) urgency = "urgent";
      else if (daysOfStock <= 14) urgency = "soon";
      const projectedNeed = Math.max(0, predictedUnits14d * 1.2 - p.quantity);
      const suggestedReorderQty = urgency === "ok" ? 0 : Math.max(Math.round(projectedNeed), p.reorderQuantity || 0);
      const trendPhrase = trend === "rising"
        ? `Sales up ${Math.round(Math.abs(pctChange))}% over last 2 weeks.`
        : trend === "falling"
        ? `Sales down ${Math.round(Math.abs(pctChange))}% over last 2 weeks.`
        : `Sales steady over last 30 days.`;
      const stockPhrase = daysOfStock <= 5
        ? `Runs out in ~${Math.max(0, Math.round(daysOfStock))} day(s) — reorder now.`
        : daysOfStock <= 14
        ? `~${Math.round(daysOfStock)} days of stock left — reorder soon.`
        : `~${Math.round(daysOfStock)} days of stock remaining.`;
      return { id: p.id, name: p.name, predictedUnits14d, avgDailyDemand: weightedDailyDemand, trend, daysOfStock, urgency, suggestedReorderQty, reason: `${trendPhrase} ${stockPhrase}` };
    });
  };

  const runForecast = async () => {
    if (payload.length === 0) { toast.error("No sales history found in the last 30 days"); return; }
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

  const sorted = forecasts.slice().sort((a, b) =>
    a.urgency === b.urgency ? b.predictedUnits14d - a.predictedUnits14d : urgencyRank(a.urgency) - urgencyRank(b.urgency)
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-3xl">
            <Sparkles className="h-5 w-5 text-primary sm:h-6 sm:w-6" /> Demand Forecast
          </h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Next 14-day demand prediction from last 30 days of sales.
          </p>
        </div>
        <Button onClick={runForecast} disabled={loading} size="lg" className="w-full sm:w-auto">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          {loading ? "Analyzing..." : "Generate Forecast"}
        </Button>
      </div>

      {/* 3 stat cards — stack on mobile, row on desktop */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className={urgentCount > 0 ? "border-destructive/50 bg-destructive/5" : ""}>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
              <Package className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <div className="text-2xl font-bold text-destructive">{urgentCount}</div>
              <div className="text-xs font-medium text-muted-foreground">Urgent Restock</div>
              <div className="text-[11px] text-muted-foreground">≤ 5 days of stock</div>
            </div>
          </CardContent>
        </Card>

        <Card className={soonCount > 0 ? "border-warning/50 bg-warning/5" : ""}>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10">
              <Package className="h-5 w-5 text-warning" />
            </div>
            <div>
              <div className="text-2xl font-bold text-warning">{soonCount}</div>
              <div className="text-xs font-medium text-muted-foreground">Order Soon</div>
              <div className="text-[11px] text-muted-foreground">6–14 days of stock</div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-success/30 bg-success/5">
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10">
              <Package className="h-5 w-5 text-success" />
            </div>
            <div>
              <div className="text-2xl font-bold text-success">{okCount}</div>
              <div className="text-xs font-medium text-muted-foreground">Well Stocked</div>
              <div className="text-[11px] text-muted-foreground">15+ days of stock</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm sm:text-base">
            <span>Product Breakdown</span>
            {generatedAt && (
              <span className="text-[11px] font-normal text-muted-foreground">
                Generated {format(new Date(generatedAt), "PPp")}
              </span>
            )}
            {forecasts.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground">{forecasts.length} products</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {forecasts.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {loading ? "Analyzing sales patterns..." : 'Click "Generate Forecast" to predict demand for the next 14 days.'}
            </div>
          ) : (
            <>
              {/* MOBILE: card per product */}
              <div className="space-y-3 sm:hidden">
                {sorted.map((f) => {
                  const product = products.find((p) => p.id === f.id);
                  return (
                    <div key={f.id} className="rounded-lg border bg-card p-3 space-y-2">
                      {/* Product name + urgency badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-sm leading-tight">{f.name}</div>
                        <UrgencyBadge urgency={f.urgency} />
                      </div>

                      {/* Key numbers row */}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-md bg-muted/40 p-1.5">
                          <div className="text-[10px] text-muted-foreground">Stock</div>
                          <div className="text-sm font-semibold">{num(product?.quantity ?? 0)}</div>
                        </div>
                        <div className="rounded-md bg-muted/40 p-1.5">
                          <div className="text-[10px] text-muted-foreground">Next 14d</div>
                          <div className="text-sm font-semibold">{num(Math.round(f.predictedUnits14d))}</div>
                        </div>
                        <div className="rounded-md bg-muted/40 p-1.5">
                          <div className="text-[10px] text-muted-foreground">Days Left</div>
                          <div className="text-sm font-semibold">{Math.round(f.daysOfStock)}d</div>
                        </div>
                      </div>

                      {/* Trend + reorder row */}
                      <div className="flex items-center justify-between gap-2">
                        <TrendBadge trend={f.trend} />
                        {f.suggestedReorderQty > 0 ? (
                          <span className="text-xs text-muted-foreground">
                            Reorder: <span className="font-semibold text-foreground">{num(Math.round(f.suggestedReorderQty))} units</span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">No reorder needed</span>
                        )}
                      </div>

                      {/* Reason */}
                      <p className="text-[11px] text-muted-foreground leading-relaxed">{f.reason}</p>
                    </div>
                  );
                })}
              </div>

              {/* DESKTOP: table (unchanged) */}
              <div className="hidden overflow-x-auto sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Avg/Day</TableHead>
                      <TableHead className="text-right">Next 14d</TableHead>
                      <TableHead>Trend</TableHead>
                      <TableHead className="text-right">Days Left</TableHead>
                      <TableHead>Urgency</TableHead>
                      <TableHead className="text-right">Reorder Qty</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.map((f) => {
                      const product = products.find((p) => p.id === f.id);
                      return (
                        <TableRow key={f.id}>
                          <TableCell className="font-medium">{f.name}</TableCell>
                          <TableCell className="text-right">{num(product?.quantity ?? 0)}</TableCell>
                          <TableCell className="text-right">{f.avgDailyDemand.toFixed(1)}</TableCell>
                          <TableCell className="text-right font-semibold">{num(Math.round(f.predictedUnits14d))}</TableCell>
                          <TableCell><TrendBadge trend={f.trend} /></TableCell>
                          <TableCell className="text-right">{Math.round(f.daysOfStock)}d</TableCell>
                          <TableCell><UrgencyBadge urgency={f.urgency} /></TableCell>
                          <TableCell className="text-right font-semibold">
                            {f.suggestedReorderQty > 0 ? num(Math.round(f.suggestedReorderQty)) : "—"}
                          </TableCell>
                          <TableCell className="max-w-[280px] text-xs text-muted-foreground">{f.reason}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Forecasts are calculated from your sales history (moving average + trend). Review against seasonality, promotions, and supplier lead times.
      </p>
    </div>
  );
}

function urgencyRank(u: string) { return u === "urgent" ? 0 : u === "soon" ? 1 : 2; }

function TrendBadge({ trend }: { trend: string }) {
  if (trend === "rising") return <Badge variant="outline" className="border-success bg-success/10 text-success gap-1 text-[11px]"><TrendingUp className="h-3 w-3" />Rising</Badge>;
  if (trend === "falling") return <Badge variant="outline" className="border-muted-foreground/40 bg-muted text-muted-foreground gap-1 text-[11px]"><TrendingDown className="h-3 w-3" />Falling</Badge>;
  return <Badge variant="outline" className="gap-1 text-[11px]"><Minus className="h-3 w-3" />Stable</Badge>;
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  if (urgency === "urgent") return <Badge variant="outline" className="border-destructive bg-destructive/10 text-destructive gap-1 text-[11px] shrink-0"><AlertTriangle className="h-3 w-3" />Urgent</Badge>;
  if (urgency === "soon") return <Badge variant="outline" className="border-warning bg-warning/10 text-warning text-[11px] shrink-0">Soon</Badge>;
  return <Badge variant="outline" className="border-success bg-success/10 text-success text-[11px] shrink-0">OK</Badge>;
}
