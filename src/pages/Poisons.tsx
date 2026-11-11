import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { store, useStore } from "@/lib/store";
import { NGN } from "@/lib/format";
import { format } from "date-fns";
import { ShieldAlert, ClipboardPlus, FileDown, ShieldCheck, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { usePlan } from "@/lib/store";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { resolveEffectiveRole } from "@/lib/permissions";

// STEP 19d: same receipt number the POS prints (first 8 characters, upper case).
const receiptNo = (saleId?: string | null) => (saleId ? saleId.slice(0, 8).toUpperCase() : "");

// STEP 19e: the register is a statutory record, so its times are always shown
// in Lagos time (WAT), whatever time zone the computer is set to. Previously a
// PC set to a UK time zone printed winter entries one hour early.
function lagosDate(iso: string | Date): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find((x) => x.type === t)?.value);
  return new Date(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
}

// STEP 19e: the PDF's built-in font has no Naira sign (it printed "¦"), which
// also broke the column widths. The PDF prints "NGN 1,401.00" instead.
const pdfNGN = (n: number) =>
  "NGN " + (Number(n) || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// STEP 20f: an email used as a name (no spaces) is broken before "@" so it
// wraps cleanly in the PDF instead of splitting mid-word.
const pdfPerson = (s?: string | null) =>
  !s ? "—" : (s.includes("@") && !s.includes(" ") ? s.replace("@", "\n@") : s);

export default function Poisons() {
  const navigate = useNavigate();
  const products = useStore((s) => s.products);
  const dispenses = useStore((s) => s.controlledDispense);
  const settings = useStore((s) => s.settings);
  const user = useStore((s) => s.user);
  // STEP 20e: adding a missing register entry is a pharmacist's job. The
  // database also refuses a Cashier's entry without a pharmacist PIN, so the
  // form is shown to the Owner and Pharmacists only.
  const role = resolveEffectiveRole(user);
  const canAddMissingEntry = role === "Owner" || role === "Pharmacist";
  const controlled = products.filter((p) => p.controlled);

  // Running balances per product (current quantity is already net of sales;
  // since Step 19 a register entry no longer changes stock by itself)
  const balances = useMemo(() => {
    const m = new Map<string, number>();
    controlled.forEach((p) => m.set(p.id, p.quantity));
    return m;
  }, [controlled]);

  const exportCsv = () => {
    const rows = [
      ["Date","Drug","Batch","Qty","Amount","Patient","Phone","Prescriber","Reg No","Rx Ref","Cashier","Sale receipt","Authorized by"].join(","),
      ...dispenses.map((d) => [
        format(lagosDate(d.at), "yyyy-MM-dd HH:mm"), d.productName, d.batch, d.quantity, d.amount,
        d.patientName, d.patientPhone || "", d.prescriber, d.prescriberRegNo || "", d.prescriptionRef, d.cashier,
        d.saleId ? receiptNo(d.saleId) : "Not linked",
        d.authorizedByName || "",
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `controlled-register-${format(lagosDate(new Date()), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  const exportInspectionPdf = () => {
    // STEP 20f: landscape A4 (like the NAFDAC Disposal Inventory). The
    // dispensing log has 11 statutory columns; on an upright page long values
    // were split mid-word. Tested with 120 rows of long values: no splits.
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    doc.setFontSize(16); doc.setFont("helvetica", "bold");
    doc.text(settings.name, pageW / 2, 16, { align: "center" });
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text(settings.address || "", pageW / 2, 22, { align: "center" });
    doc.text(`Tel: ${settings.phone || "—"}  ·  PCN Premise License: ${settings.premiseLicense || "—"}`, pageW / 2, 27, { align: "center" });

    doc.setFontSize(13); doc.setFont("helvetica", "bold");
    doc.text("POISONS REGISTER / CONTROLLED DRUGS LOG", pageW / 2, 36, { align: "center" });
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text("Statutory record per Pharmacists Council of Nigeria (PCN) & NDLEA requirements", pageW / 2, 41, { align: "center" });
    doc.text(`Generated: ${format(lagosDate(new Date()), "dd MMM yyyy HH:mm")} (Lagos time, WAT)  ·  Total entries: ${dispenses.length}  ·  Controlled SKUs: ${controlled.length}`, pageW / 2, 46, { align: "center" });

    let y = 54;
    doc.setFontSize(11); doc.setFont("helvetica", "bold");
    doc.text("1. Controlled substances on hand", 14, y); y += 2;
    autoTable(doc, {
      startY: y, styles: { fontSize: 8 }, headStyles: { fillColor: [180, 50, 50] },
      head: [["Drug", "NAFDAC", "Batch", "Balance", "Reorder", "Expiry"]],
      body: controlled.length === 0 ? [["—", "—", "—", "—", "—", "—"]] :
        controlled.map((p) => [p.name, p.nafdac, p.batch, String(p.quantity), String(p.reorderLevel), p.expiry]),
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    if (y > pageH - 50) { doc.addPage(); y = 20; }
    doc.setFontSize(11); doc.setFont("helvetica", "bold");
    doc.text("2. Statutory dispensing log", 14, y); y += 2;
    autoTable(doc, {
      startY: y, styles: { fontSize: 7.5, cellPadding: 1.5, overflow: "linebreak" }, headStyles: { fillColor: [180, 50, 50] },
      columnStyles: {
        0: { cellWidth: 17 },
        3: { cellWidth: 10, halign: "right" },
        4: { cellWidth: 25, halign: "right" },
        9: { cellWidth: 17 },
      },
      // STEP 20e: phone moved into the Patient cell (as on screen) to make room for "Authorized by".
      head: [["Date", "Drug", "Batch", "Qty", "Amount", "Patient / Phone", "Prescriber", "Reg No", "Rx Ref", "Sale", "Authorized by"]],
      body: dispenses.length === 0 ? [["—","—","—","—","—","—","—","—","—","—","—"]] :
        dispenses.map((d) => [
          `${format(lagosDate(d.at), "dd-MM-yy")}\n${format(lagosDate(d.at), "HH:mm")}`, d.productName, d.batch, String(d.quantity),
          pdfNGN(d.amount), d.patientPhone ? `${d.patientName}\n${d.patientPhone}` : d.patientName,
          d.prescriber, d.prescriberRegNo || "—", d.prescriptionRef,
          d.saleId ? receiptNo(d.saleId) : "Not linked",
          pdfPerson(d.authorizedByName),
        ]),
    });
    y = (doc as any).lastAutoTable.finalY + 14;

    if (y > pageH - 35) { doc.addPage(); y = 30; }
    doc.setFontSize(9); doc.setFont("helvetica", "normal");
    doc.text("Certified true record of controlled drugs dispensed at the above premise.", 14, y); y += 14;
    doc.text("Superintendent Pharmacist: _______________________________", 14, y); y += 8;
    doc.text("PCN Reg No: _______________________   Signature: _______________________   Date: ____________", 14, y);

    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(7); doc.setTextColor(120);
      doc.text(`${settings.name} — Poisons Register — Page ${i} of ${pages}`, pageW / 2, pageH - 8, { align: "center" });
    }
    doc.save(`poisons-register-${format(lagosDate(new Date()), "yyyy-MM-dd")}.pdf`);
    toast.success("Inspection-ready PDF generated");
  };




  const plan = usePlan();
  if (!plan.canPoisonsRegister) return <div className="p-6"><UpgradePrompt feature="Poisons Register" requiredPlan="basic" description="NAFDAC-compliant controlled drug dispensing log with pharmacist PIN authorization." /></div>;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Poisons / Controlled Register</h1>
            <p className="text-sm text-muted-foreground">Statutory record per Pharmacists Council of Nigeria & NDLEA requirements</p>
            <p className="mt-1 text-xs text-muted-foreground">Premise: <span className="font-medium">{settings.name}</span> · License: {settings.premiseLicense || "—"}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:shrink-0">
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-1.5">
            <Button variant="ghost" size="sm" onClick={() => navigate("/inventory?filter=controlled")}>
              <PackagePlus className="mr-1.5 h-4 w-4" />Manage drugs
            </Button>
            <Button variant="ghost" size="sm" onClick={exportCsv}><FileDown className="mr-1.5 h-4 w-4" />Export CSV</Button>
            <Button variant="ghost" size="sm" onClick={exportInspectionPdf}><ShieldCheck className="mr-1.5 h-4 w-4" />Inspection PDF</Button>
          </div>
          {canAddMissingEntry && <DispenseDialog products={controlled} />}
        </div>
      </div>

      <Card className="shadow-card border-l-4 border-l-destructive">
        <CardHeader className="pb-2"><CardTitle className="text-base">Controlled substances on hand — running balance</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Drug</TableHead><TableHead>NAFDAC</TableHead><TableHead>Batch</TableHead>
              <TableHead className="text-right">Balance</TableHead><TableHead>Reorder Lvl</TableHead><TableHead>Expiry</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {controlled.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No controlled substances on file</TableCell></TableRow>}
              {controlled.map((p) => {
                const bal = balances.get(p.id) ?? 0;
                const low = bal <= p.reorderLevel;
                return (
                  <TableRow key={p.id} className={low ? "bg-destructive/5" : ""}>
                    <TableCell className="font-medium">{p.name} <span className="text-xs text-muted-foreground">{p.packSize}</span></TableCell>
                    <TableCell className="text-xs">{p.nafdac}</TableCell>
                    <TableCell className="text-xs">{p.batch}</TableCell>
                    <TableCell className="text-right">
                      <span className={`font-bold ${low ? "text-destructive" : ""}`}>{bal}</span>
                    </TableCell>
                    <TableCell className="text-xs">{p.reorderLevel}</TableCell>
                    <TableCell className="text-xs">{format(new Date(p.expiry), "dd MMM yyyy")}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-2"><CardTitle className="text-base">Statutory dispensing log ({dispenses.length}) <span className="text-xs font-normal text-muted-foreground">· times in Lagos time (WAT)</span></CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Drug</TableHead><TableHead>Batch</TableHead>
                <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Amount</TableHead>
                <TableHead>Patient</TableHead><TableHead>Prescriber</TableHead>
                <TableHead>Rx Ref</TableHead><TableHead>Cashier</TableHead>
                <TableHead>Sale</TableHead>
                <TableHead>Authorized by</TableHead>
                <TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {dispenses.length === 0 && <TableRow><TableCell colSpan={12} className="py-8 text-center text-sm text-muted-foreground">No controlled dispensings recorded yet</TableCell></TableRow>}
                {dispenses.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="text-xs">{format(lagosDate(d.at), "dd MMM yyyy HH:mm")}</TableCell>
                    <TableCell><Badge variant="outline" className="border-destructive text-destructive">{d.productName}</Badge></TableCell>
                    <TableCell className="text-xs font-mono">{d.batch}</TableCell>
                    <TableCell className="text-right font-medium">{d.quantity}</TableCell>
                    <TableCell className="text-right">{NGN(d.amount)}</TableCell>
                    <TableCell className="text-xs"><div className="font-medium">{d.patientName}</div><div className="text-muted-foreground">{d.patientPhone}</div></TableCell>
                    <TableCell className="text-xs"><div>{d.prescriber}</div><div className="text-muted-foreground">{d.prescriberRegNo}</div></TableCell>
                    <TableCell className="text-xs font-mono">{d.prescriptionRef}</TableCell>
                    <TableCell className="text-xs">{d.cashier}</TableCell>
                    <TableCell className="text-xs">
                      {/* STEP 19d: the sale this entry belongs to (POS receipt number). */}
                      {d.saleId
                        ? <span className="font-mono">#{receiptNo(d.saleId)}</span>
                        : <span className="text-muted-foreground" title="Recorded before register entries were linked to sales">Not linked</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {/* STEP 20e: the pharmacist who authorized the entry (PIN for Cashier sales). */}
                      {d.authorizedByName
                        ? d.authorizedByName
                        : <span className="text-muted-foreground" title="Recorded before pharmacist authorization was stored">—</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {/* COMPLIANCE FIX: surfaces sync status on the register itself so a
                          pharmacist can see at a glance whether an entry recorded while
                          offline has actually reached the cloud yet — same visibility
                          Sales History already has for pending sales. */}
                      {d.syncStatus === "pending" && d.syncError
                        ? <Badge variant="outline" className="border-destructive text-destructive" title={d.syncError}>Needs attention</Badge>
                        : d.syncStatus === "pending"
                        ? <Badge variant="outline" className="border-warning text-warning">Syncing…</Badge>
                        : <Badge variant="outline" className="border-success text-success">Synced</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// STEP 19d: "Add missing register entry". A register entry is a RECORD of a
// controlled sale. Dispensing itself happens at the Sales Counter (POS), which
// records the entry at the same time. This form is only for a controlled sale
// whose register entry is missing (e.g. it failed to save) — the pharmacist
// picks that sale, and the entry is linked to it. It never changes stock.
type OpenLine = {
  key: string;
  saleId: string;
  createdAt: string;
  productId: string;
  name: string;
  price: number;
  sold: number;
  recorded: number;
  remaining: number;
  salePending: boolean;
};

const UNLINKED_MATCH_MS = 10 * 60 * 1000;

function DispenseDialog({ products }: { products: ReturnType<typeof useStore<any>> }) {
  const list = products as Array<{ id: string; name: string; batch: string; sellingPrice: number; quantity: number }>;
  const sales = useStore((s) => s.sales);
  const dispenses = useStore((s) => s.controlledDispense);
  const [open, setOpen] = useState(false);
  const [lineKey, setLineKey] = useState("");
  const [qty, setQty] = useState(1);
  const [patientName, setPatientName] = useState("");
  const [patientPhone, setPatientPhone] = useState("");
  const [prescriber, setPrescriber] = useState("");
  const [prescriberRegNo, setPrescriberRegNo] = useState("");
  const [prescriptionRef, setPrescriptionRef] = useState("");
  // COMPLIANCE FIX: guards against double-submitting a dispense (e.g. an
  // impatient double-click while the write is in flight), same pattern
  // POS.tsx already uses for sales.
  const [submitting, setSubmitting] = useState(false);

  // Controlled sale lines (last 90 days loaded) that still have units without
  // a register entry. Linked entries count against their own sale. Older
  // entries (before Step 19, not linked) are matched to the nearest sale of
  // the same product within 10 minutes — the same rule Step 19a used — so
  // they are not shown as "missing" and recorded twice.
  const openLines = useMemo<OpenLine[]>(() => {
    const controlledIds = new Set(list.map((p) => p.id));
    const lines = new Map<string, OpenLine>();
    for (const s of sales) {
      for (const it of s.items) {
        if (!controlledIds.has(it.productId)) continue;
        const key = `${s.id}|${it.productId}`;
        const existing = lines.get(key);
        if (existing) {
          existing.sold += it.qty;
        } else {
          lines.set(key, {
            key, saleId: s.id, createdAt: s.createdAt, productId: it.productId, name: it.name,
            price: Number(it.price) || 0, sold: it.qty, recorded: 0, remaining: 0,
            salePending: s.syncStatus === "pending",
          });
        }
      }
    }
    // Pass 1: entries linked to their sale.
    for (const d of dispenses) {
      if (!d.saleId) continue;
      const line = lines.get(`${d.saleId}|${d.productId}`);
      if (line) line.recorded += d.quantity;
    }
    // Pass 2: older entries without a link — nearest matching sale.
    for (const d of dispenses) {
      if (d.saleId) continue;
      const t = new Date(d.at).getTime();
      let best: OpenLine | undefined;
      let bestGap = Infinity;
      for (const line of lines.values()) {
        if (line.productId !== d.productId) continue;
        const gap = Math.abs(new Date(line.createdAt).getTime() - t);
        if (gap <= UNLINKED_MATCH_MS && gap < bestGap && line.recorded < line.sold) { best = line; bestGap = gap; }
      }
      if (best) best.recorded += d.quantity;
    }
    return [...lines.values()]
      .map((l) => ({ ...l, remaining: l.sold - l.recorded }))
      .filter((l) => l.remaining > 0)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [sales, dispenses, list]);

  const line = openLines.find((l) => l.key === lineKey);
  const product = line ? list.find((p) => p.id === line.productId) : undefined;
  const amount = (line?.price || 0) * qty;

  const reset = () => {
    setLineKey(""); setQty(1); setPatientName(""); setPatientPhone("");
    setPrescriber(""); setPrescriberRegNo(""); setPrescriptionRef("");
  };

  const chooseLine = (key: string) => {
    setLineKey(key);
    const l = openLines.find((x) => x.key === key);
    setQty(l ? l.remaining : 1);
  };

  // COMPLIANCE FIX (kept): awaits the save, tells the pharmacist honestly when
  // it was queued offline, and leaves the form open with its data intact on a
  // genuine failure so nothing has to be re-typed from memory.
  const submit = async () => {
    if (submitting) return;
    if (!line) { toast.error("Select the sale this entry belongs to"); return; }
    if (!product) { toast.error("This drug is no longer marked as controlled in Inventory"); return; }
    if (!(product.batch || "").trim()) { toast.error(`Add a batch number for ${product.name} in Inventory first — the Poisons Register requires it`); return; }
    if (!patientName.trim()) { toast.error("Patient name required"); return; }
    if (!prescriber.trim()) { toast.error("Prescriber name required"); return; }
    if (!prescriberRegNo.trim()) { toast.error("MDCN / Reg No required"); return; }
    if (!prescriptionRef.trim()) { toast.error("Prescription reference required"); return; }
    if (!Number.isInteger(qty) || qty <= 0 || qty > line.remaining) {
      toast.error(`Quantity must be between 1 and ${line.remaining} (units sold on this sale without a register entry)`);
      return;
    }

    setSubmitting(true);
    try {
      const result = await store.recordControlledDispense({
        saleId: line.saleId,
        productId: product.id, productName: product.name, batch: product.batch,
        quantity: qty, amount, patientName: patientName.trim(), patientPhone: patientPhone.trim(),
        prescriber: prescriber.trim(), prescriberRegNo: prescriberRegNo.trim(), prescriptionRef: prescriptionRef.trim(),
      });

      if (!result.ok) {
        // Real (non-network) rejection — store.ts already showed the reason.
        // Leave the form open with the entries intact.
        return;
      }

      if (result.offline) {
        toast.info("Register entry saved on this device — it will sync automatically once its sale and the connection are available.", { duration: 10000 });
      } else {
        toast.success("Missing register entry added and linked to its sale");
      }
      reset(); setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
          <ClipboardPlus className="mr-1.5 h-4 w-4" />Add missing register entry
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Add missing register entry</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">
          Use this only for a controlled drug already sold at the Sales Counter whose register entry is missing.
          To dispense a controlled drug, sell it at the Sales Counter — the register entry is recorded there.
          Stock is not changed here (the sale already reduced it).
        </p>
        {openLines.length === 0 ? (
          <div className="rounded-md border bg-muted/30 p-4 text-sm">
            Every controlled sale from the last 90 days already has its register entry. Nothing is missing.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="md:col-span-2">
              <Label>Sale *</Label>
              <Select value={lineKey} onValueChange={chooseLine}>
                <SelectTrigger><SelectValue placeholder="Select the sale this entry belongs to" /></SelectTrigger>
                <SelectContent>
                  {openLines.map((l) => (
                    <SelectItem key={l.key} value={l.key}>
                      {format(lagosDate(l.createdAt), "dd MMM yyyy HH:mm")} · #{receiptNo(l.saleId)} · {l.name} — {l.remaining} of {l.sold} without entry{l.salePending ? " (sale not synced yet)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Older entries made before sale linking are matched to their sale by drug and time (within 10 minutes).
              </p>
            </div>
            <div>
              <Label>Batch</Label>
              <Input value={product?.batch || ""} disabled placeholder="—" />
            </div>
            <div>
              <Label>Quantity *</Label>
              <Input type="number" min={1} max={line?.remaining ?? 1} value={qty}
                onChange={(e) => setQty(parseInt(e.target.value) || 1)} disabled={!line} />
            </div>
            <div>
              <Label>Amount (as sold)</Label>
              <Input value={NGN(amount)} disabled />
            </div>
            <div>
              <Label>Patient name *</Label>
              <Input value={patientName} onChange={(e) => setPatientName(e.target.value)} />
            </div>
            <div>
              <Label>Patient phone</Label>
              <Input value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} />
            </div>
            <div>
              <Label>Prescriber (Doctor) *</Label>
              <Input value={prescriber} onChange={(e) => setPrescriber(e.target.value)} />
            </div>
            <div>
              <Label>MDCN / Reg No *</Label>
              <Input value={prescriberRegNo} onChange={(e) => setPrescriberRegNo(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label>Prescription Ref *</Label>
              <Input value={prescriptionRef} onChange={(e) => setPrescriptionRef(e.target.value)} placeholder="e.g. RX-2026-00123" />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Cancel</Button>
          {openLines.length > 0 && (
            <Button onClick={submit} disabled={submitting || !line} className="bg-destructive hover:bg-destructive/90">
              {submitting ? "Saving…" : "Add register entry"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
