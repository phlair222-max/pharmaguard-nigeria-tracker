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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, TrendingUp, TrendingDown, Minus, RefreshCw, Clock } from "lucide-react";

// ---- Types ------------------------------------------------

interface Product {
  id: string;
  name: string;
  quantity: number;
  reorder_level: number;
  reorder_quantity: number;
}

interface SaleRecord {
  product_id: string;
  quantity: number;
  sale_date: string;
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

function formatDate(isoString: string | null): string {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleString("en-NG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---- Component --------------------------------------------

export default function Forecast() {
  const [forecasts, setForecasts] = useState<Forecast[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [nextUpdateAt, setNextUpdateAt] = useState<string | null>(null);
  const [source, setSource] = useState<"gemini" | "cache" | null>(null);

  // On page load, check if there's a cached forecast to show immediately
  // without waiting for the user to click the button.
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
        const generatedAtMs = new Date(data.generated_at).getTime();
        const nextUpdateAtIso = new Date(
          generatedAtMs + 7 * 24 * 60 * 60 * 1000
        ).toISOString();
        setForecasts(data.forecasts as Forecast[]);
        setGeneratedAt(data.generated_at);
        setNextUpdateAt(nextUpdateAtIso);
        setSource("cache");
      }
    } catch {
      // Silently ignore — user can still click Generate Forecast to try again.
    }
  }

  async function generateForecast() {
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch products from the database.
      const { data: products, error: prodError } = await supabase
        .from("products")
        .select("id, name, quantity, reorder_level, reorder_quantity");

      if (prodError) throw new Error(`Could not load products: ${prodError.message}`);
      if (!products || products.length === 0) throw new Error("No products found in your inventory.");

      // 2. Fetch the last 30 days of sales.
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const cutoffDate = thirtyDaysAgo.toISOString().split("T")[0];

      const { data: sales, error: salesError } = await supabase
        .from("sales")
        .select("product_id, quantity, sale_date")
        .gte("sale_date", cutoffDate);

      if (salesError) throw new Error(`Could not load sales: ${salesError.message}`);

      // 3. Build per-product daily-sales arrays (30 slots, one per day).
      const dailySalesMap = buildDailySalesMap(
        (sales as SaleRecord[]) ?? [],
        (products as Product[]).map((p) => p.id)
      );

      // 4. Assemble the payload for the Edge Function.
      const payload = (products as Product[]).map((p) => ({
        id: p.id,
        name: p.name,
        quantity: p.quantity,
        reorderLevel: p.reorder_level,
        reorderQuantity: p.reorder_quantity,
        dailySales: dailySalesMap[p.id] ?? new Array(30).fill(0),
      }));

      // 5. Invoke the Edge Function.
      // The function itself decides whether to call Gemini or return a
      // cached result — the frontend always sends the fresh payload so
      // the function can use it if a Gemini call is needed.
      const { data: result, error: fnError } = await supabase.functions.invoke(
        "forecast-demand",
        { body: { products: payload } }
      );

      if (fnError) throw new Error(`Edge Function error: ${fnError.message}`);
      if (!result || !result.forecasts) throw new Error("Edge Function returned no forecast data.");

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

  // Build a map of productId → number[30] (daily unit sales, oldest → newest)
  function buildDailySalesMap(
    sales: SaleRecord[],
    productIds: string[]
  ): Record<string, number[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result: Record<string, number[]> = {};
    for (const id of productIds) {
      result[id] = new Array(30).fill(0);
    }

    for (const sale of sales) {
      if (!result[sale.product_id]) continue;
      const saleDate = new Date(sale.sale_date);
      saleDate.setHours(0, 0, 0, 0);
      const daysAgo = Math.floor((today.getTime() - saleDate.getTime()) / 86400000);
      const slotIndex = 29 - daysAgo; // index 0 = 30 days ago, 29 = today
      if (slotIndex >= 0 && slotIndex < 30) {
        result[sale.product_id][slotIndex] += sale.quantity;
      }
    }

    return result;
  }

  // ---- Stat card summaries ----
  const urgentCount = forecasts.filter((f) => f.urgency === "urgent").length;
  const soonCount = forecasts.filter((f) => f.urgency === "soon").length;
  const okCount = forecasts.filter((f) => f.urgency === "ok").length;

  return (
    <div className="space-y-6 p-4">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold">AI Demand Forecast</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gemini AI analyses your 30-day sales history to predict demand and
          suggest reorder quantities. Results are cached for 7 days to keep
          costs minimal.
        </p>
      </div>

      {/* Generate button + cache status */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button onClick={generateForecast} disabled={loading} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Generating…" : "Generate Forecast"}
        </Button>

        {/* Cache timestamp info — always shown when data exists */}
        {generatedAt && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 shrink-0" />
            <span>
              {source === "cache" ? "Cached result from" : "Generated"}{" "}
              <strong>{formatDate(generatedAt)}</strong>
              {nextUpdateAt && (
                <>
                  {" "}— next Gemini call available{" "}
                  <strong>{formatDate(nextUpdateAt)}</strong>
                </>
              )}
            </span>
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Stat summary cards — only shown when we have data */}
      {forecasts.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card className="border-red-200 bg-red-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-red-700 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" /> Urgent Restock
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-red-700">{urgentCount}</p>
                <p className="text-xs text-red-500 mt-1">≤ 5 days of stock</p>
              </CardContent>
            </Card>

            <Card className="border-yellow-200 bg-yellow-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-yellow-700 flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" /> Order Soon
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-yellow-700">{soonCount}</p>
                <p className="text-xs text-yellow-500 mt-1">6–14 days of stock</p>
              </CardContent>
            </Card>

            <Card className="border-green-200 bg-green-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-green-700">
                  Well Stocked
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-green-700">{okCount}</p>
                <p className="text-xs text-green-500 mt-1">15+ days of stock</p>
              </CardContent>
            </Card>
          </div>

          {/* Forecast table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Avg Daily Sales</TableHead>
                  <TableHead className="text-right">Predicted (14d)</TableHead>
                  <TableHead className="text-right">Days of Stock</TableHead>
                  <TableHead>Trend</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Reorder Qty</TableHead>
                  <TableHead>AI Reasoning</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forecasts.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.name}</TableCell>
                    <TableCell className="text-right">
                      {f.avgDailyDemand.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right">
                      {f.predictedUnits14d}
                    </TableCell>
                    <TableCell className="text-right">
                      {f.daysOfStock >= 999 ? "∞" : f.daysOfStock}
                    </TableCell>
                    <TableCell>
                      <TrendIcon trend={f.trend} />
                    </TableCell>
                    <TableCell>
                      <UrgencyBadge urgency={f.urgency} />
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {f.suggestedReorderQty > 0 ? f.suggestedReorderQty : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs">
                      {f.reason}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* Empty state — no forecast yet */}
      {forecasts.length === 0 && !loading && !error && (
        <div className="rounded-md border border-dashed p-12 text-center text-muted-foreground">
          <p className="text-lg font-medium">No forecast yet</p>
          <p className="text-sm mt-1">
            Click <strong>Generate Forecast</strong> to have Gemini AI analyse
            your sales data. Results are cached for 7 days.
          </p>
        </div>
      )}
    </div>
  );
}

// ---- Small sub-components ---------------------------------

function TrendIcon({ trend }: { trend: "rising" | "falling" | "stable" }) {
  if (trend === "rising")
    return (
      <span className="flex items-center gap-1 text-green-600 font-medium">
        <TrendingUp className="h-4 w-4" /> Rising
      </span>
    );
  if (trend === "falling")
    return (
      <span className="flex items-center gap-1 text-red-600 font-medium">
        <TrendingDown className="h-4 w-4" /> Falling
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      <Minus className="h-4 w-4" /> Stable
    </span>
  );
}

function UrgencyBadge({ urgency }: { urgency: "urgent" | "soon" | "ok" }) {
  if (urgency === "urgent")
    return <Badge variant="destructive">Urgent</Badge>;
  if (urgency === "soon")
    return (
      <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 hover:bg-yellow-100">
        Order Soon
      </Badge>
    );
  return (
    <Badge className="bg-green-100 text-green-800 border-green-300 hover:bg-green-100">
      OK
    </Badge>
  );
}
