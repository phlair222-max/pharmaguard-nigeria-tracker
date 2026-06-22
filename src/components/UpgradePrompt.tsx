import { useNavigate } from "react-router-dom";
import { Lock, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  feature: string;           // e.g. "AI Disposal Report"
  requiredPlan: "basic" | "pro";
  description?: string;
  compact?: boolean;         // inline button variant vs full card
};

const PLAN_DAILY = { basic: "₦500", pro: "₦700" };
const PLAN_MONTHLY = { basic: "₦15,000", pro: "₦21,000" };
const PLAN_LABEL = { basic: "Basic", pro: "Pro" };

export function UpgradePrompt({ feature, requiredPlan, description, compact = false }: Props) {
  const navigate = useNavigate();

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
          onClick={() => navigate("/settings")}
        >
          Upgrade · {PLAN_DAILY[requiredPlan]}/day
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
          onClick={() => navigate("/settings")}
        >
          <Zap className="h-4 w-4" />
          Upgrade to {PLAN_LABEL[requiredPlan]} · {PLAN_DAILY[requiredPlan]}/day
        </Button>
        <span className="text-xs text-muted-foreground">{PLAN_MONTHLY[requiredPlan]}/month · Cancel anytime</span>
      </div>
    </div>
  );
}
