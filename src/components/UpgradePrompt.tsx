import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { NGN } from "@/lib/format";

type Props = {
  feature: string;           // e.g. "AI Disposal Report"
  requiredPlan: "basic" | "pro";
  description?: string;
  compact?: boolean;         // inline button variant vs full card
};

// FIX (Nov 2026, wrong prices shown to customers): prices used to be typed
// into this file (Basic "₦15,000/month · ₦500/day", Pro "₦21,000/month ·
// ₦700/day") and had drifted from the real plans (Basic ₦25,000, Pro
// ₦45,000). The price now comes from plan_config.price_monthly — the same
// value Platform Admin edits — so it can never drift again.
// While the price is loading, or if it cannot be read, NO price is shown
// (never a wrong one). The "/day" figure was removed: billing is monthly.
const PLAN_LABEL = { basic: "Basic", pro: "Pro" };

// Read each plan's price once per page load and share it between every
// UpgradePrompt on screen (no repeated database calls).
const priceCache: Partial<Record<"basic" | "pro", Promise<number | null>>> = {};

function loadPlanPrice(tier: "basic" | "pro"): Promise<number | null> {
  if (!priceCache[tier]) {
    priceCache[tier] = (async () => {
      const { data, error } = await (supabase.from as any)("plan_config")
        .select("price_monthly")
        .eq("tier", tier)
        .maybeSingle();
      if (error || !data) {
        if (error) console.error("[UpgradePrompt] could not read plan price", error);
        delete priceCache[tier]; // allow a retry next time the prompt appears
        return null;
      }
      const n = Number(data.price_monthly);
      return Number.isFinite(n) && n > 0 ? n : null;
    })();
  }
  return priceCache[tier]!;
}

function usePlanPrice(tier: "basic" | "pro"): number | null {
  const [price, setPrice] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    loadPlanPrice(tier).then((p) => { if (alive) setPrice(p); });
    return () => { alive = false; };
  }, [tier]);
  return price;
}

// Whole naira, e.g. "₦45,000" (plan prices have no kobo).
const wholeNaira = (n: number) => NGN(n).replace(/\.00$/, "");

export function UpgradePrompt({ feature, requiredPlan, description, compact = false }: Props) {
  const navigate = useNavigate();
  const price = usePlanPrice(requiredPlan);
  // FIX (Nov 2026): go straight to the Plan & Billing tab, the same place
  // the sidebar's "Upgrade to Pro" button opens (was the generic Settings tab).
  const goToBilling = () => navigate("/settings?tab=billing");

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
        <Lock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
        <span className="text-xs text-amber-300 flex-1">
          <strong>{feature}</strong> requires the {PLAN_LABEL[requiredPlan]} plan
        </span>
        <Button
          size="sm"
          className="h-7 text-xs bg-amber-500 hover:bg-amber-400 text-black font-bold px-3"
          onClick={goToBilling}
        >
          Upgrade{price !== null ? ` · ${wholeNaira(price)}/month` : ""}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20">
        <Lock className="h-5 w-5 text-amber-400" />
      </div>
      <div>
        <h3 className="font-semibold text-foreground">{feature}</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">
          {description ?? `This feature is available on the ${PLAN_LABEL[requiredPlan]} plan and above.`}
        </p>
      </div>
      <div className="flex items-center gap-3 flex-wrap justify-center">
        <Button
          className="gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold"
          onClick={goToBilling}
        >
          <Zap className="h-4 w-4" />
          Upgrade to {PLAN_LABEL[requiredPlan]}
        </Button>
        {price !== null && (
          <span className="text-xs text-muted-foreground">
            {PLAN_LABEL[requiredPlan]} plan: {wholeNaira(price)}/month
          </span>
        )}
      </div>
    </div>
  );
}
