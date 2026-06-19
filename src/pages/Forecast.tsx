import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Clock,
  Sparkles,
  PackageX,
  Package,
  PackageCheck,
  ChevronRight,
} from "lucide-react";

// ---- Types ------------------------------------------------

interface Product {
  id: string;
  name: string;
  quantity: number;
  reorder_level: number;
  reorder_quantity: number;
}

interface SaleItem {
  product_id: string;
  qty: number;
  sale_id: string;
  sales: { created_at: string } | null;
}

interface Forecast {
  id: string;
  name: string;
  predictedUnits14d: number;
  avgDailyDemand: number;
  trend: "rising" | "falling" | "stable";
  daysOfStock: number;
  urgency: "urgent" | "soon" | "ok";
  suggestedReorderQty: number;
  reason: string;
}

// ---- Helpers ----------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function daysOfStockBar(days: number): { width: string; color: string } {
  if (days >= 999) return { width: "100%", color: "#22c55e" };
  const pct = Math.min((days / 60) * 100, 100);
  const color = days <= 5 ? "#ef4444" : days <= 14 ? "#f59e0b" : "#22c55e";
  return { width: `${pct}%`, color };
}

// ---- Component --------------------------------------------

export default function Forecast() {
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [nextUpdateAt, setNextUpdateAt] = useState<string | null>(null);
  const [source, setSource] = useState<"gemini" | "cache" | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  useEffect(() => {
    loadCachedForecast();
  }, []);

  async function loadCachedForecast() {
    try {
      const { data } = await supabase
        .from("forecast_cache")
        .select("forecasts, generated_at")
        .eq("id", 1)
        .maybeSingle();
      if (data) {
        const ms = new Date(data.generated_at).getTime();
        setForecasts(data.forecasts as Forecast[]);
        setGeneratedAt(data.generated_at);
        setNextUpdateAt(new Date(ms + 7 * 86400000).toISOString());
        setSource("cache");
      }
    } catch { /* silent */ }
  }

  async function generateForecast() {
    setLoading(true);
    setError(null);
    try {
      const { data: products, error: prodError } = await supabase
        .from("products")
        .select("id, name, quantity, reorder_level, reorder_quantity");
      if (prodError) throw new Error(`Could not load products: ${prodError.message}`);
      if (!products?.length) throw new Error("No products found in your inventory.");

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: saleItems, error: salesError } = await supabase
        .from("sale_items")
        .select("product_id, qty, sale_id, sales!inner(created_at)")
        .gte("sales.created_at", thirtyDaysAgo.toISOString());
      if (salesError) throw new Error(`Could not load sales: ${salesError.message}`);

      const dailySalesMap = buildDailySalesMap(
        (saleItems as unknown as SaleItem[]) ?? [],
        (products as Product[]).map((p) => p.id)
      );

      const payload = (products as Product[]).map((p) => ({
        id: p.id,
        name: p.name,
        quantity: p.quantity,
        reorderLevel: p.reorder_level,
        reorderQuantity: p.reorder_quantity,
        dailySales: dailySalesMap[p.id] ?? new Array(30).fill(0),
      }));

      const { data: result, error: fnError } = await supabase.functions.invoke(
        "forecast-demand",
        { body: { products: payload } }
      );
      if (fnError) throw new Error(`Edge Function error: ${fnError.message}`);
      if (!result?.forecasts) throw new Error("No forecast data returned.");

      setForecasts(result.forecasts as Forecast[]);
      setGeneratedAt(result.generated_at ?? null);
      setNextUpdateAt(result.next_update_at ?? null);
      setSource(result.source ?? "gemini");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function buildDailySalesMap(
    items: SaleItem[],
    productIds: string[]
  ): Record<string, number[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result: Record<string, number[]> = {};
    for (const id of productIds) result[id] = new Array(30).fill(0);
    for (const item of items) {
      if (!item.product_id || !result[item.product_id] || !item.sales?.created_at) continue;
      const d = new Date(item.sales.created_at);
      d.setHours(0, 0, 0, 0);
      const slot = 29 - Math.floor((today.getTime() - d.getTime()) / 86400000);
      if (slot >= 0 && slot < 30) result[item.product_id][slot] += item.qty ?? 0;
    }
    return result;
  }

  const urgentCount = forecasts.filter((f) => f.urgency === "urgent").length;
  const soonCount   = forecasts.filter((f) => f.urgency === "soon").length;
  const okCount     = forecasts.filter((f) => f.urgency === "ok").length;

  // Sort: urgent first, then soon, then ok
  const sorted = [...forecasts].sort((a, b) => {
    const order = { urgent: 0, soon: 1, ok: 2 };
    return order[a.urgency] - order[b.urgency];
  });

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }} className="min-h-screen p-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-5 w-5 text-emerald-400" />
            <span className="text-xs font-semibold tracking-widest uppercase text-emerald-400">
              Gemini AI · Demand Intelligence
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Stock Forecast</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-lg">
            30-day sales history analysed weekly. Reorder priorities calculated per product.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <Button
            onClick={generateForecast}
            disabled={loading}
            className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-5"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Analysing…" : "Generate Forecast"}
          </Button>

          {generatedAt && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>
                {source === "cache" ? "Cached" : "Generated"}{" "}
                <strong className="text-foreground">{formatDate(generatedAt)}</strong>
                {nextUpdateAt && (
                  <> · refreshes <strong className="text-foreground">{formatDate(nextUpdateAt)}</strong></>
                )}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <strong className="font-semibold">Error — </strong>{error}
        </div>
      )}

      {/* ── Summary Cards ── */}
      {forecasts.length > 0 && (
        <>
          <div className="grid grid-cols-3 gap-4">

            {/* Urgent */}
            <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-5 flex items-center gap-4">
              <div className="rounded-lg bg-red-500/20 p-3">
                <PackageX className="h-6 w-6 text-red-400" />
              </div>
              <div>
                <p className="text-3xl font-bold text-red-400 leading-none">{urgentCount}</p>
                <p className="text-xs font-medium text-red-400/80 mt-1">Urgent Restock</p>
                <p className="text-xs text-muted-foreground">≤ 5 days of stock</p>
              </div>
            </div>

            {/* Order Soon */}
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-5 flex items-center gap-4">
              <div className="rounded-lg bg-amber-500/20 p-3">
                <Package className="h-6 w-6 text-amber-400" />
              </div>
              <div>
                <p className="text-3xl font-bold text-amber-400 leading-none">{soonCount}</p>
                <p className="text-xs font-medium text-amber-400/80 mt-1">Order Soon</p>
                <p className="text-xs text-muted-foreground">6–14 days of stock</p>
              </div>
            </div>

            {/* Well Stocked */}
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-5 flex items-center gap-4">
              <div className="rounded-lg bg-emerald-500/20 p-3">
                <PackageCheck className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-3xl font-bold text-emerald-400 leading-none">{okCount}</p>
                <p className="text-xs font-medium text-emerald-400/80 mt-1">Well Stocked</p>
                <p className="text-xs text-muted-foreground">15+ days of stock</p>
              </div>
            </div>
          </div>

          {/* ── Table ── */}
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
              <h2 className="font-semibold text-sm">Product Breakdown</h2>
              <span className="text-xs text-muted-foreground">{forecasts.length} products</span>
            </div>

            <div className="overflow-x-auto">
              <Table style={{ tableLayout: "fixed", width: "100%" }}>
                {/* Fixed column widths — this is what makes spacing uniform */}
                <colgroup>
                  <col style={{ width: "22%" }} /> {/* Product */}
                  <col style={{ width: "10%" }} /> {/* Avg / Day */}
                  <col style={{ width: "10%" }} /> {/* Next 14d */}
                  <col style={{ width: "18%" }} /> {/* Stock Runway */}
                  <col style={{ width: "12%" }} /> {/* Trend */}
                  <col style={{ width: "12%" }} /> {/* Status */}
                  <col style={{ width: "12%" }} /> {/* Reorder Qty */}
                  <col style={{ width: "4%" }}  /> {/* Chevron */}
                </colgroup>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-6 py-4">Product</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-6 py-4 text-right">Avg / Day</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-6 py-4 text-right">Next 14d</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-6 py-4">Stock Runway</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-6 py-4">Trend</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-6 py-4">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-6 py-4 text-right">Reorder Qty</TableHead>
                    <TableHead className="px-4 py-4"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((f) => {
                    const bar = daysOfStockBar(f.daysOfStock);
                    const isExpanded = expandedRow === f.id;
                    return (
                      <>
                        <TableRow
                          key={f.id}
                          className="border-border/30 cursor-pointer hover:bg-white/[0.03] transition-colors"
                          onClick={() => setExpandedRow(isExpanded ? null : f.id)}
                        >
                          {/* Product name */}
                          <TableCell className="font-medium px-6 py-4 truncate">{f.name}</TableCell>

                          {/* Avg daily */}
                          <TableCell className="px-6 py-4 text-right tabular-nums text-muted-foreground">
                            {f.avgDailyDemand.toFixed(1)}
                          </TableCell>

                          {/* Predicted */}
                          <TableCell className="px-6 py-4 text-right tabular-nums font-semibold">
                            {f.predictedUnits14d}
                          </TableCell>

                          {/* Stock runway bar */}
                          <TableCell className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                                <div
                                  style={{ width: bar.width, backgroundColor: bar.color }}
                                  className="h-full rounded-full transition-all"
                                />
                              </div>
                              <span className="text-xs tabular-nums text-muted-foreground w-10 text-right shrink-0">
                                {f.daysOfStock >= 999 ? "∞" : `${f.daysOfStock}d`}
                              </span>
                            </div>
                          </TableCell>

                          {/* Trend */}
                          <TableCell className="px-6 py-4">
                            <TrendPill trend={f.trend} />
                          </TableCell>

                          {/* Status */}
                          <TableCell className="px-6 py-4">
                            <StatusBadge urgency={f.urgency} />
                          </TableCell>

                          {/* Reorder qty */}
                          <TableCell className="px-6 py-4 text-right">
                            {f.suggestedReorderQty > 0 ? (
                              <span className="font-bold text-emerald-400">
                                {f.suggestedReorderQty}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </TableCell>

                          {/* Expand toggle */}
                          <TableCell className="px-4 py-4">
                            <ChevronRight
                              className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
                            />
                          </TableCell>
                        </TableRow>

                        {/* Expanded AI reasoning row */}
                        {isExpanded && (
                          <TableRow key={`${f.id}-reason`} className="border-border/20 bg-white/[0.02]">
                            <TableCell colSpan={8} className="px-6 py-4">
                              <div className="flex items-start gap-2">
                                <Sparkles className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                  {f.reason}
                                </p>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="px-5 py-3 border-t border-border/30 text-xs text-muted-foreground">
              Click any row to see Gemini's reasoning · Sorted by urgency
            </div>
          </div>
        </>
      )}

      {/* ── Empty state ── */}
      {forecasts.length === 0 && !loading && !error && (
        <div className="rounded-xl border border-dashed border-border/50 py-20 flex flex-col items-center gap-4 text-center">
          <div className="rounded-full bg-emerald-500/10 p-4">
            <Sparkles className="h-8 w-8 text-emerald-400" />
          </div>
          <div>
            <p className="font-semibold text-lg">No forecast yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Click <strong>Generate Forecast</strong> to analyse your 30-day sales
              history. Gemini AI will predict demand and flag what needs restocking.
            </p>
          </div>
          <Button
            onClick={generateForecast}
            disabled={loading}
            className="gap-2 bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            <Sparkles className="h-4 w-4" />
            Generate Forecast
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function TrendPill({ trend }: { trend: "rising" | "falling" | "stable" }) {
  if (trend === "rising")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
        <TrendingUp className="h-3.5 w-3.5" /> Rising
      </span>
    );
  if (trend === "falling")
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400">
        <TrendingDown className="h-3.5 w-3.5" /> Falling
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <Minus className="h-3.5 w-3.5" /> Stable
    </span>
  );
}

function StatusBadge({ urgency }: { urgency: "urgent" | "soon" | "ok" }) {
  if (urgency === "urgent")
    return (
      <span className="inline-flex items-center rounded-full border border-red-500/40 bg-red-500/15 px-2.5 py-0.5 text-xs font-semibold text-red-400">
        Urgent
      </span>
    );
  if (urgency === "soon")
    return (
      <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-400">
        Order Soon
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
      OK
    </span>
  );
}
