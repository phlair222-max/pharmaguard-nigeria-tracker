import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useStore, salesVelocityMap, movementSpeed, usePlan } from "@/lib/store";
import { NGN, num, expiryTier, expiryBadgeClass, daysUntil, movementBadgeClass, formatShelfLocation } from "@/lib/format";
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
// STEP 21: new "expired" tier (solid red) for expired stock still on hand.
// It links to the Expired filter and CANNOT be dismissed — expired stock must
// be quarantined, so the warning stays until the stock is dealt with.
// Each tier now carries its own link (before, every banner went to "near").
type BannerTier = {
  label: string; count: number; tone: "expired" | "red" | "amber" | "yellow"; key: string;
  link: string;          // STEP 21
  dismissible: boolean;  // STEP 21
  extra?: string;        // STEP 21: e.g. "(3 archived)"
};

function ExpiryBanner({ tiers }: { tiers: BannerTier[] }) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const visible = tiers.filter((t) => !dismissed.has(t.key) && t.count > 0);
  if (visible.length === 0) return null;

  const styles: Record<string, string> = {
    expired: "border-destructive bg-destructive text-destructive-foreground shadow-sm", // STEP 21
    red:    "border-destructive/60 bg-destructive/10 text-destructive",
    amber:  "border-amber-500/60 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    yellow: "border-yellow-500/60 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400",
  };
  const iconStyles: Record<string, string> = {
    expired: "text-destructive-foreground", // STEP 21
    red:    "text-destructive",
    amber:  "text-amber-500",
    yellow: "text-yellow-500",
  };

  return (
    <div className="space-y-2">
      {visible.map((t) => (
        <div
          key={t.key}
          role={t.tone === "expired" ? "alert" : undefined}
          className={`flex items-center justify-between rounded-lg border px-4 py-3 ${styles[t.tone]}`}
        >
          <Link to={t.link} className="flex items-center gap-3 flex-1 min-w-0">
            <AlertTriangle className={`h-4 w-4 shrink-0 ${iconStyles[t.tone]}`} />
            <span className="text-sm font-medium">
              <span className="font-bold">{t.count} {t.tone === "expired" ? "expired " : ""}product{t.count !== 1 ? "s" : ""}</span>{" "}{t.label}
              {t.extra && <span className="opacity-80"> {t.extra}</span>}
            </span>
            <span className="text-xs opacity-70 hidden sm:inline">— tap to review</span>
          </Link>
          {t.dismissible && (
            <button
              onClick={() => setDismissed((prev) => new Set(prev).add(t.key))}
              className="ml-3 shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              aria-label={`Dismiss ${t.label} alert`}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── NAFDAC Disposal Inventory Card ────────────────────────────────────────────
// STEP 17 (Nov 2026): replaces the "AI Disposal Report". NAFDAC's guideline
// ENF-GDL-001-00 says a pharmacy APPLIES to NAFDAC for destruction with an
// inventory of the unwholesome products; NAFDAC verifies and supervises.
// The server (generate-disposal-report) now builds that inventory from the
// database — only EXPIRED stock with quantity above 0, controlled medicines
// listed separately, no AI — and this card lays it out for printing, plus an
// optional cover letter. Near-expiry stock is still sellable and is NOT part
// of the inventory (it stays in the "Expired & Near Expiry" list above).
// Only the Owner or a Pharmacist may generate it (also enforced on the server).

type InventoryRow = {
  name: string; generic: string; nafdacNo: string; manufacturer: string;
  batch: string; manufacturingDate: string; expiry: string;
  productCategory: string; pharmacologicalClass: string; countryOfSource: string;
  quantity: number; unitPrice: number; marketValue: number; reason: string;
  archived: boolean;
};
type DisposalInventory = {
  refNo: string; date: string; asOf: string; guideline: string;
  generatedBy: { email: string; role: string };
  pharmacy: {
    name: string; address: string; phone: string; email: string;
    premiseLicense: string; pcnLicense: string; ownerName: string;
  };
  general: InventoryRow[];
  controlled: InventoryRow[];
  totals: {
    items: number; quantity: number; marketValue: number;
    generalItems: number; generalValue: number;
    controlledItems: number; controlledValue: number;
    missingManufacturer: number; missingBatch: number;
  };
};

// Every value printed comes from data people typed (product names etc.), so
// it is escaped before going into the print window.
const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
// Whole numbers with thousands separators, e.g. 13,893.
const count = (n: number) => new Intl.NumberFormat("en-NG").format(n || 0);
const money = (n: number) =>
  new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const blankLine = (v: string, width = "60mm") =>
  v ? esc(v) : `<span style="display:inline-block;width:${width};border-bottom:1px solid #000">&nbsp;</span>`;

function letterheadHtml(inv: DisposalInventory) {
  const p = inv.pharmacy;
  return `
    <div class="lh">
      <div class="lh-name">${esc(p.name)}</div>
      <div>${esc(p.address)}</div>
      <div>${p.phone ? "Tel: " + esc(p.phone) : ""}${p.phone && p.email ? " &nbsp;·&nbsp; " : ""}${p.email ? "Email: " + esc(p.email) : ""}</div>
      <div>Premises Licence No: ${blankLine(p.premiseLicense, "45mm")}</div>
    </div>`;
}

// STEP 17c (print review): the subtotal is the LAST body row, not a table
// footer — browsers repeat a table footer at the bottom of every printed
// page, which made the section subtotal appear on each page.
function sectionTable(title: string, note: string, rows: InventoryRow[], startAt: number) {
  if (rows.length === 0) {
    return `<h2>${esc(title)}</h2><p class="note">${esc(note)}</p><p><em>None.</em></p>`;
  }
  const qty = rows.reduce((a, r) => a + r.quantity, 0);
  const value = rows.reduce((a, r) => a + r.marketValue, 0);
  const body = rows.map((r, i) => `
    <tr>
      <td class="c">${startAt + i}</td>
      <td><strong>${esc(r.name)}</strong>${r.generic && r.generic.toLowerCase() !== r.name.toLowerCase() ? `<br><span class="sub">${esc(r.generic)}</span>` : ""}${r.archived ? `<br><span class="sub">(archived product)</span>` : ""}</td>
      <td>${esc(r.nafdacNo)}</td>
      <td>${esc(r.manufacturer)}</td>
      <td class="nw">${esc(r.batch)}</td>
      <td>${esc(r.manufacturingDate)}</td>
      <td class="nw">${esc(r.expiry)}</td>
      <td>${esc(r.productCategory)}${r.pharmacologicalClass ? `<br><span class="sub">${esc(r.pharmacologicalClass)}</span>` : ""}</td>
      <td>${esc(r.countryOfSource)}</td>
      <td class="r">${count(r.quantity)}</td>
      <td class="r">${money(r.unitPrice)}</td>
      <td class="r">${money(r.marketValue)}</td>
      <td>${esc(r.reason)}</td>
    </tr>`).join("");
  return `
    <h2>${esc(title)}</h2>
    <p class="note">${esc(note)}</p>
    <table>
      <thead><tr>
        <th>#</th><th>Product name</th><th>NAFDAC Reg. No.</th><th>Manufacturer (name &amp; address)</th>
        <th>Batch No.</th><th>Mfg. date</th><th>Expiry date</th><th>Category / Pharmacological class</th>
        <th>Country of source</th><th>Qty</th><th>Unit price (₦)</th><th>Market value (₦)</th><th>Reason</th>
      </tr></thead>
      <tbody>${body}
      <tr class="subtotal">
        <td colspan="9" class="r"><strong>Subtotal</strong></td>
        <td class="r"><strong>${count(qty)}</strong></td><td></td>
        <td class="r"><strong>${money(value)}</strong></td><td></td>
      </tr></tbody>
    </table>`;
}

function inventoryHtml(inv: DisposalInventory) {
  const t = inv.totals;
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Inventory of Expired Products for Destruction ${esc(inv.refNo)}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 8pt; color: #000; margin: 0; }
    .lh { text-align: center; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px; }
    .lh-name { font-size: 13pt; font-weight: bold; }
    h1 { font-size: 11pt; text-align: center; margin: 6px 0 2px; }
    h2 { font-size: 9.5pt; margin: 10px 0 2px; }
    .meta { text-align: center; margin-bottom: 4px; }
    .note { margin: 0 0 4px; font-style: italic; }
    table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
    th, td { border: 1px solid #000; padding: 2px 3px; vertical-align: top; }
    th { background: #eee; font-size: 7.5pt; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
    .r { text-align: right; } .c { text-align: center; } .nw { white-space: nowrap; }
    .sub { color: #333; font-size: 7pt; }
    .subtotal td { background: #f4f4f4; }
    .totals td { border: none; padding: 1px 4px; }
    .sign { margin-top: 10px; page-break-inside: avoid; }
    /* STEP 21: Section B (controlled medicines) starts on its own page */
    .new-page { page-break-before: always; break-before: page; }
    .sign td { border: none; padding: 5px 4px; }
    .foot { margin-top: 8px; font-size: 7pt; color: #333; }
  </style></head><body>
  ${letterheadHtml(inv)}
  <h1>INVENTORY OF EXPIRED PRODUCTS FOR DESTRUCTION</h1>
  <div class="meta">Ref: <strong>${esc(inv.refNo)}</strong> &nbsp;·&nbsp; Date: ${esc(inv.date)} &nbsp;·&nbsp;
    Stock position as at ${esc(inv.asOf)} &nbsp;·&nbsp; Prepared in line with NAFDAC Guidelines ${esc(inv.guideline)}</div>

  ${sectionTable(
    "SECTION A — GENERAL PRODUCTS",
    "Expired products held at the premises, removed from sale and quarantined, for verification and supervised destruction by NAFDAC.",
    inv.general, 1)}

  <!-- STEP 21: Section B starts on a new page when both sections have items
       (if either section is empty, its "None." line stays on the same page
       instead of wasting a sheet). -->
  <div class="${inv.general.length > 0 && inv.controlled.length > 0 ? "new-page" : ""}">
  ${sectionTable(
    "SECTION B — CONTROLLED MEDICINES (kept separately)",
    "Controlled medicines are stored separately and are NOT destroyed with general stock. To be handed over or returned as directed by NAFDAC.",
    inv.controlled, inv.general.length + 1)}
  </div>

  <table class="totals" style="width:auto;margin-top:8px">
    <tr><td>Total items:</td><td><strong>${count(t.items)}</strong> (general ${count(t.generalItems)}, controlled ${count(t.controlledItems)})</td></tr>
    <tr><td>Total quantity:</td><td><strong>${count(t.quantity)}</strong></td></tr>
    <tr><td>Total market value:</td><td><strong>₦${money(t.marketValue)}</strong> (at current selling prices)</td></tr>
  </table>

  <div class="sign">
    <p>I certify that the products listed above are expired products held by this pharmacy, that they have been
    removed from sale and quarantined, and that the information given is correct to the best of my knowledge.</p>
    <table>
      <tr><td>Superintendent Pharmacist (name):</td><td>${blankLine("", "70mm")}</td>
          <td>PCN Reg. No.:</td><td>${blankLine("", "45mm")}</td></tr>
      <tr><td>Signature:</td><td>${blankLine("", "70mm")}</td>
          <td>Date:</td><td>${blankLine("", "45mm")}</td></tr>
      <tr><td>Pharmacy stamp:</td><td colspan="3">&nbsp;</td></tr>
    </table>
  </div>

  <div class="foot">Manufacturing dates are not recorded in the system and should be completed from the product packs.
  Market value = quantity × current selling price. Generated with PharmaGuard NG by ${esc(inv.generatedBy.email)}
  (${esc(inv.generatedBy.role)}).</div>
  </body></html>`;
}

function coverLetterHtml(inv: DisposalInventory) {
  const p = inv.pharmacy;
  const t = inv.totals;
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Application for Destruction ${esc(inv.refNo)}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.5; color: #000; margin: 0; }
    .lh { text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 14px; font-size: 10pt; }
    .lh-name { font-size: 15pt; font-weight: bold; }
    p { margin: 0 0 10px; }
    .subj { font-weight: bold; text-decoration: underline; }
  </style></head><body>
  ${letterheadHtml(inv)}
  <p>Our Ref: ${esc(inv.refNo)}<br>Date: ${esc(inv.date)}</p>
  <p>The Director-General<br>
  National Agency for Food and Drug Administration and Control (NAFDAC)<br>
  Attention: The Director, Investigation and Enforcement Directorate<br>
  ${blankLine("", "90mm")} <span style="font-size:9pt">(address of NAFDAC office)</span></p>
  <p>Dear Sir/Madam,</p>
  <p class="subj">APPLICATION FOR THE VERIFICATION AND DESTRUCTION OF EXPIRED PRODUCTS</p>
  <p>We write to apply for the verification and supervised destruction of expired products held at our premises,
  ${esc(p.name)}${p.address ? ", " + esc(p.address) : ""}${p.premiseLicense ? " (Premises Licence No. " + esc(p.premiseLicense) + ")" : ""},
  in line with the NAFDAC Guidelines for Handling and Disposal of Unwholesome Medicines and NAFDAC Regulated Products (${esc(inv.guideline)}).</p>
  <p>The attached inventory (Ref: ${esc(inv.refNo)}) lists <strong>${count(t.items)}</strong> item(s), a total quantity of
  <strong>${count(t.quantity)}</strong>, with a total market value of <strong>₦${money(t.marketValue)}</strong>.
  ${t.controlledItems > 0
    ? `Of these, <strong>${count(t.controlledItems)}</strong> item(s) are controlled medicines, listed separately in Section B and stored apart from general stock, for handling as the Agency directs.`
    : ""}</p>
  <p>The products have been removed from sale and are quarantined in a separate area labelled
  “Expired Products, Not for Sale”. We will make the premises and records available for inspection and will
  comply with the Agency's directions, including payment of any prescribed fees.</p>
  <p>We look forward to your response.</p>
  <p>Yours faithfully,</p>
  <p style="margin-top:28px">${blankLine("", "70mm")}<br>
  Name: ${blankLine(p.ownerName, "70mm")}<br>
  Designation: Superintendent Pharmacist / Owner<br>
  PCN Reg. No.: ${blankLine("", "50mm")}<br>
  Phone: ${blankLine(p.phone, "50mm")}</p>
  <p style="font-size:9pt">Enclosure: Inventory of Expired Products for Destruction (Ref: ${esc(inv.refNo)})</p>
  </body></html>`;
}

function openAndPrint(html: string) {
  const w = window.open("", "_blank");
  if (!w) { toast.error("Please allow pop-ups for this site to print."); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

function DisposalReportCard({ expiredCount, canGenerate }: { expiredCount: number; canGenerate: boolean }) {
  const plan = usePlan();
  const [loading, setLoading] = useState(false);
  const [inv, setInv] = useState<DisposalInventory | null>(null);

  const generate = async () => {
    setLoading(true);
    try {
      // The server builds the list from the database; nothing is sent from here.
      const { data, error } = await supabase.functions.invoke("generate-disposal-report", { body: {} });
      if (error) {
        // Show the server's own message (e.g. "Only the Owner or a Pharmacist…").
        let msg = error.message;
        try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* keep default */ }
        throw new Error(msg);
      }
      if (!data || !Array.isArray(data.general)) throw new Error("Unexpected response from the server.");
      setInv(data as DisposalInventory);
    } catch (e: any) {
      toast.error("Could not build the inventory: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const t = inv?.totals;

  return (
    <Card className="shadow-card border-destructive/20">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-destructive" />
          NAFDAC Disposal Inventory
        </CardTitle>
        {plan.canDisposalReport && canGenerate && expiredCount > 0 && !inv && (
          <button
            onClick={generate}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md bg-destructive/10 border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
            {loading ? "Building…" : "Generate Inventory"}
          </button>
        )}
      </CardHeader>
      <CardContent>
        {!plan.canDisposalReport ? (
          <UpgradePrompt
            feature="NAFDAC Disposal Inventory"
            requiredPlan="pro"
            description="Builds the inventory of expired stock that NAFDAC asks for when you apply for destruction, with controlled medicines listed separately and a cover letter. Ready to print and sign."
          />
        ) : expiredCount === 0 && !inv ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No expired stock on hand — nothing to apply for 🎉
          </div>
        ) : inv && t ? (
          <div className="space-y-3">
            {t.items === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No expired stock on hand — nothing to apply for.</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md border p-2">
                    <div className="text-lg font-bold">{num(t.items)}</div>
                    <div className="text-[11px] text-muted-foreground">expired items</div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-lg font-bold">{num(t.controlledItems)}</div>
                    <div className="text-[11px] text-muted-foreground">controlled (Section B)</div>
                  </div>
                  <div className="rounded-md border p-2">
                    <div className="text-lg font-bold">{NGN(t.marketValue)}</div>
                    <div className="text-[11px] text-muted-foreground">market value</div>
                  </div>
                </div>
                {(t.missingManufacturer > 0 || t.missingBatch > 0) && (
                  <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-[11px] text-warning">
                    Missing details NAFDAC asks for:
                    {t.missingManufacturer > 0 && ` ${t.missingManufacturer} item(s) without a manufacturer.`}
                    {t.missingBatch > 0 && ` ${t.missingBatch} item(s) without a batch number.`}
                    {" "}Add them in Inventory and generate again, or complete them by hand.
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => openAndPrint(inventoryHtml(inv))}
                    className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary/10 border border-primary/30 px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors"
                  >
                    <Printer className="h-3.5 w-3.5" /> Print Inventory
                  </button>
                  <button
                    onClick={() => openAndPrint(coverLetterHtml(inv))}
                    className="flex-1 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold hover:bg-muted transition-colors"
                  >
                    <Printer className="h-3.5 w-3.5" /> Print Cover Letter
                  </button>
                </div>
              </>
            )}
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Ref: {inv.refNo}</span>
              <button onClick={() => setInv(null)} className="underline hover:text-foreground">Clear</button>
            </div>
          </div>
        ) : !canGenerate ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            {expiredCount} expired product{expiredCount !== 1 ? "s" : ""} in stock. Only the Owner or a
            Pharmacist can generate the NAFDAC disposal inventory.
          </div>
        ) : (
          <div className="py-4 text-center space-y-1">
            <p className="text-sm text-muted-foreground">
              {expiredCount} expired product{expiredCount !== 1 ? "s" : ""} in stock
            </p>
            <p className="text-xs text-muted-foreground">
              Click "Generate Inventory" to build the list NAFDAC asks for when you apply for destruction.
              Near-expiry stock is not included — it can still be sold.
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
  // STEP 14b-2 follow-up: profit is null for users without margin access
  // (the card is hidden for them anyway); treat null as 0 so the sum is a number.
  const todayProfit = todaySales.reduce((a, s) => a + (s.profit ?? 0), 0);

  const last30Start = todayStart - 29 * 86400000;
  const last30 = sales.filter((s) => new Date(s.createdAt).getTime() >= last30Start);
  const distinctDays = Math.max(1, new Set(last30.map((s) => format(new Date(s.createdAt), "yyyy-MM-dd"))).size);
  const dailyAvg = last30.reduce((a, s) => a + s.total, 0) / distinctDays;

  const stockCostValue = products.reduce((a, p) => a + p.quantity * (p.costPrice ?? 0), 0);
  const stockSellValue = products.reduce((a, p) => a + p.quantity * p.sellingPrice, 0);

  const lowStock = products.filter((p) => p.quantity <= p.reorderLevel);
  // EXPIRY ALERTS (Nov 2026) — one rule for every expiry alert on this page
  // and for the disposal report:
  //   • only stock physically on hand counts (quantity > 0) — with nothing
  //     on the shelf there is nothing to remove or dispose of;
  //   • active AND archived products count — archiving stops a product being
  //     sold, but boxes still on the shelf still expire (archived ones are
  //     labelled "Archived" in the list);
  //   • all product types count (pharmaceutical and non-pharmaceutical);
  //   • products with no valid expiry date are skipped.
  const onHand = products.filter((p) => p.quantity > 0 && Number.isFinite(daysUntil(p.expiry)));

  const expiredItems = onHand.filter((p) => daysUntil(p.expiry) < 0);
  const expiredCount = expiredItems.length;

  const near30 = onHand.filter((p) => { const d = daysUntil(p.expiry); return d >= 0 && d <= 30; });
  const near60 = onHand.filter((p) => { const d = daysUntil(p.expiry); return d > 30 && d <= 60; });
  const near90 = onHand.filter((p) => { const d = daysUntil(p.expiry); return d > 60 && d <= 90; });

  // Expired + expiring within 30 days, soonest (most overdue) first.
  // Feeds the "Expired & Near Expiry" list and the disposal report.
  const disposalItems = [...expiredItems, ...near30].sort(
    (a, b) => daysUntil(a.expiry) - daysUntil(b.expiry),
  );

  // STEP 21: expired stock still on hand gets its own top banner. Same rule as
  // every other expiry alert (quantity > 0, active AND archived, all types);
  // archived ones are counted in the number and mentioned in brackets.
  const expiredArchivedCount = expiredItems.filter((p) => p.active === false).length;

  const expiryBannerTiers: BannerTier[] = [
    { key: "expired", count: expiredCount,  tone: "expired", label: "still in stock — quarantine immediately", link: "/inventory?filter=expired", dismissible: false,
      extra: expiredArchivedCount > 0 ? `(${expiredArchivedCount} archived)` : undefined },
    { key: "red",    count: near30.length, tone: "red",    label: "expiring within 30 days — urgent action needed", link: "/inventory?filter=near", dismissible: true },
    { key: "amber",  count: near60.length, tone: "amber",  label: "expiring within 31–60 days — plan disposal soon", link: "/inventory?filter=near", dismissible: true },
    { key: "yellow", count: near90.length, tone: "yellow", label: "expiring within 61–90 days — monitor closely", link: "/inventory?filter=near", dismissible: true },
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
            <CardHeader><CardTitle className="text-base">Expired &amp; Near Expiry (≤30 days)</CardTitle></CardHeader>
            <CardContent>
              {disposalItems.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">Nothing expired or expiring soon 🎉</div>
              ) : (
                <div className="space-y-2">
                  {disposalItems.slice(0, 8).map((p) => {
                    const tier = expiryTier(p.expiry);
                    const d = daysUntil(p.expiry);
                    const archived = p.active === false;
                    const loc = formatShelfLocation(p);
                    return (
                      <Link key={p.id} to={d < 0 ? "/inventory?filter=expired" : "/inventory?filter=near"} className="flex items-center justify-between gap-2 rounded-md border p-2 hover:bg-muted/50">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-sm font-medium">
                            <span className="truncate">{p.name}</span>
                            {archived && (
                              <Badge variant="outline" className="shrink-0 border-muted-foreground/40 bg-muted px-1.5 py-0 text-[10px] text-muted-foreground">Archived</Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Batch {p.batch} · qty {p.quantity} · {loc ? `Loc ${loc}` : "No shelf location"}
                          </div>
                        </div>
                        <Badge variant="outline" className={`shrink-0 ${expiryBadgeClass(tier)}`}>{d < 0 ? `Expired ${-d}d ago` : `${d}d left`}</Badge>
                      </Link>
                    );
                  })}
                  {disposalItems.length > 8 && (
                    <div className="pt-1 text-center text-xs text-muted-foreground">
                      + {disposalItems.length - 8} more — see Inventory
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* STEP 17: the inventory lists EXPIRED stock only (built on the server). */}
          <DisposalReportCard
            expiredCount={expiredItems.length}
            canGenerate={user?.memberRole === "Owner" || user?.memberRole === "Pharmacist"}
          />
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
