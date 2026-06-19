import { useMemo } from "react";
import { Activity, ShieldAlert, HeartPulse, TrendingUp } from "lucide-react";
import { useStore } from "@/lib/store";
import { NGN, num, daysUntil } from "@/lib/format";

// ---- Static message pools (edit freely) ----------------------------------

const REGULATORY = [
  "PCN requires every premise to retain a valid practice license — confirm yours is current.",
  "NAFDAC registration numbers must be verified before stocking new products.",
  "The Poisons Register must be updated at point of dispensing, not after.",
  "Controlled substances require dispenser ID and prescriber reference at every sale.",
  "PCN inspections can be unannounced — an audit-ready register is a calm pharmacist's best friend.",
  "Expired stock must be quarantined and disposed of per NAFDAC guidelines, never resold.",
  "Annual premises renewal lapses are a leading cause of PCN sanctions — mark your calendar.",
];

const HEALTH_FACTS = [
  "Did you know? The human heart beats about 100,000 times a day.",
  "Did you know? Honey never spoils — archaeologists have found 3,000-year-old honey still edible.",
  "Did you know? Your stomach gets an entirely new lining every 3–4 days.",
  "Did you know? A sneeze can travel out of the body at over 150 km/h.",
  "Did you know? The adult human body contains enough iron to make a 3-inch nail.",
  "Did you know? Paracetamol's exact mechanism of action is still not fully understood by science.",
  "Did you know? Aspirin was originally derived from willow bark.",
  "Did you know? The placebo effect can trigger measurable physical changes in the body.",
  "Did you know? Humans shed about 600,000 particles of skin every hour.",
];

const MOTIVATION = [
  "Every dose dispensed correctly is a life trusted to you.",
  "Stock checked today is a stockout avoided tomorrow.",
  "The pharmacies that scale are the ones that track.",
  "Small daily stock checks prevent big monthly losses.",
  "Compliance today saves a crisis tomorrow.",
  "Great pharmacists fill prescriptions. Great pharmacy owners build systems.",
];

// Fisher–Yates shuffle so order differs on every load/session
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type TickerItem = { text: string; icon: typeof Activity };

function useTickerItems(): TickerItem[] {
  const products = useStore((s) => s.products);
  const sales = useStore((s) => s.sales);

  return useMemo(() => {
    const today = new Date().toDateString();
    const salesToday = sales.filter((s) => new Date(s.createdAt).toDateString() === today);
    const stockValue = products.reduce((sum, p) => sum + p.quantity * p.sellingPrice, 0);
    const lowStock = products.filter((p) => p.quantity <= p.reorderLevel).length;
    const expiringSoon = products.filter((p) => { const d = daysUntil(p.expiry); return d >= 0 && d <= 30; }).length;
    const controlledCount = products.filter((p) => p.controlled).length;

    // Live stats — pulled straight from the store, real numbers
    const live: TickerItem[] = [
      { text: `${NGN(stockValue)} in stock value currently tracked`, icon: TrendingUp },
      { text: `${num(products.length)} product${products.length === 1 ? "" : "s"} in inventory right now`, icon: Activity },
      { text: `${num(salesToday.length)} sale${salesToday.length === 1 ? "" : "s"} recorded today`, icon: TrendingUp },
    ];
    if (lowStock > 0) live.push({ text: `${num(lowStock)} item${lowStock === 1 ? "" : "s"} flagged for low stock — review today`, icon: ShieldAlert });
    if (expiringSoon > 0) live.push({ text: `${num(expiringSoon)} product${expiringSoon === 1 ? "" : "s"} expiring within 30 days`, icon: ShieldAlert });
    if (controlledCount > 0) live.push({ text: `${num(controlledCount)} controlled drug${controlledCount === 1 ? "" : "s"} under active register`, icon: ShieldAlert });

    const regulatory: TickerItem[] = shuffle(REGULATORY).map((text) => ({ text, icon: ShieldAlert }));
    const facts: TickerItem[] = shuffle(HEALTH_FACTS).map((text) => ({ text, icon: HeartPulse }));
    const motivation: TickerItem[] = shuffle(MOTIVATION).map((text) => ({ text, icon: TrendingUp }));

    // Interleave so it never reads as "live stuff, then static block" — feels like one continuous feed
    const pools = [shuffle(live), regulatory, facts, motivation];
    const merged: TickerItem[] = [];
    let i = 0;
    while (pools.some((p) => p.length > 0)) {
      const pool = pools[i % pools.length];
      if (pool.length) merged.push(pool.shift()!);
      i++;
    }
    return merged;
  }, [products, sales]);
}

function TickerStream({ items }: { items: TickerItem[] }) {
  return (
    <div className="flex w-max items-center whitespace-nowrap">
      {items.map((item, idx) => {
        const Icon = item.icon;
        return (
          <span key={idx} className="flex items-center gap-3 px-5">
            <Icon className="h-3.5 w-3.5 shrink-0 text-primary/70" />
            <span className="text-[12.5px] font-medium text-muted-foreground">{item.text}</span>
            <span className="h-1 w-1 shrink-0 rounded-full bg-border" />
          </span>
        );
      })}
    </div>
  );
}

export default function HeaderTicker() {
  const items = useTickerItems();
  if (!items.length) return <div className="flex-1" />;

  return (
    <>
      <div className="group relative mx-3 flex h-full flex-1 min-w-0 items-center overflow-hidden">
        {/* Edge fade masks so text doesn't hard-cut at the container edges */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-card to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-card to-transparent" />

        {/* "Live" indicator */}
        <div className="z-10 mr-3 flex shrink-0 items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2 py-0.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-success">Live</span>
        </div>

        <div className="ticker-track flex items-center group-hover:[animation-play-state:paused]">
          <TickerStream items={items} />
          <TickerStream items={items} aria-hidden />
        </div>
      </div>
      <style>{`
        @keyframes ticker-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .ticker-track {
          width: max-content;
          animation: ticker-scroll 60s linear infinite;
        }
        @media (max-width: 640px) {
          .ticker-track { animation-duration: 38s; }
        }
      `}</style>
    </>
  );
}
