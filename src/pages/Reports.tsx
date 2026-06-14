import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";
import { NGN, expiryStatus, daysUntil } from "@/lib/format";
import { format, startOfDay } from "date-fns";
import { FileDown, FileText, ShieldCheck, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";

// ── Safe jsPDF + autoTable loader ──────────────────────────────────────────
// We import jsPDF and autoTable dynamically to avoid SSR issues and to
// guarantee the autoTable plugin is registered on the jsPDF instance before use.
async function makePdf() {
  const { default: jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF();
  // Register the plugin on this instance
  (doc as any).__autoTable = autoTable;
  return { doc, autoTable: (head: string[][], body: any[][], opts: any) => {
    autoTable(doc, { head, body, ...opts });
    return (doc as any).lastAutoTable?.finalY ?? opts.startY + 20;
  }};
}

export default function Reports() {
  const sales = useStore((s) => s.sales);
  const products = useStore((s) => s.products);
  const settings = useStore((s) => s.settings);
  const dispenses = useStore((s) => s.controlledDispense);
  const audit = useStore((s) => s.audit);
  const [from, setFrom] = useState(format(new Date(Date.now() - 6 * 86400000), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [pdfLoading, setPdfLoading] = useState(false);

  const inRange = useMemo(() => {
    const f = startOfDay(new Date(from)).getTime();
    const t = startOfDay(new Date(to)).getTime() + 86400000;
    return sales.filter((s) => { const x = new Date(s.createdAt).getTime(); return x >= f && x < t; });
  }, [sales, from, to]);

  const totals = inRange.reduce(
    (a, s) => ({ rev: a.rev + s.total, profit: a.profit + s.profit, count: a.count + 1 }),
    { rev: 0, profit: 0, count: 0 }
  );

  const expiryRows = products
    .map((p) => ({ ...p, status: expiryStatus(p.expiry), days: daysUntil(p.expiry) }))
    .sort((a, b) => a.days - b.days);

  const stockCostValue = products.reduce((a, p) => a + p.quantity * p.costPrice, 0);
  const stockSellValue = products.reduce((a, p) => a + p.quantity * p.sellingPrice, 0);

  const profitMap = new Map<string, { name: string; units: number; revenue: number; profit: number }>();
  for (const s of inRange) {
    for (const it of s.items) {
      const cur = profitMap.get(it.productId) || { name: it.name, units: 0, revenue: 0, profit: 0 };
      const cost = it.cost ?? products.find((p) => p.id === it.productId)?.costPrice ?? 0;
      cur.units += it.qty; cur.revenue += it.qty * it.price; cur.profit += it.qty * (it.price - cost);
      profitMap.set(it.productId, cur);
    }
  }
  const profitRows = [...profitMap.values()].sort((a, b) => b.profit - a.profit);

  const movementMap = new Map<string, { name: string; sold: number; revenue: number }>();
  for (const s of inRange) {
    for (const it of s.items) {
      const cur = movementMap.get(it.productId) || { name: it.name, sold: 0, revenue: 0 };
      cur.sold += it.qty; cur.revenue += it.qty * it.price;
      movementMap.set(it.productId, cur);
    }
  }
  const movementRows = products
    .map((p) => {
      const m = movementMap.get(p.id);
      return { id: p.id, name: p.name, batch: p.batch, opening: p.quantity + (m?.sold || 0), sold: m?.sold || 0, closing: p.quantity, revenue: m?.revenue || 0 };
    })
    .sort((a, b) => b.sold - a.sold);

  // ── INSPECTION PDF ──────────────────────────────────────────────────────
  const inspectionReadyPdf = async () => {
    setPdfLoading(true);
    try {
      const { doc, autoTable } = await makePdf();
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      // ── Header ──
      doc.setFontSize(16); doc.setFont("helvetica", "bold");
      doc.text(settings.name || "Pharmacy", pageW / 2, 16, { align: "center" });
      doc.setFontSize(9); doc.setFont("helvetica", "normal");
      if (settings.address) doc.text(settings.address, pageW / 2, 22, { align: "center" });
      doc.text(
        `Tel: ${settings.phone || "—"}   |   PCN License: ${settings.premiseLicense || "—"}`,
        pageW / 2, 27, { align: "center" }
      );
      doc.setDrawColor(22, 160, 110); doc.setLineWidth(0.5);
      doc.line(14, 30, pageW - 14, 30);
      doc.setFontSize(12); doc.setFont("helvetica", "bold");
      doc.text("INSPECTION-READY COMPLIANCE REPORT", pageW / 2, 37, { align: "center" });
      doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(100);
      doc.text(
        `Period: ${from}  to  ${to}   |   Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`,
        pageW / 2, 43, { align: "center" }
      );
      doc.setTextColor(0);

      let y = 50;

      const section = (num: string, title: string) => {
        if (y > pageH - 60) { doc.addPage(); y = 20; }
        doc.setFontSize(10); doc.setFont("helvetica", "bold"); doc.setTextColor(22, 160, 110);
        doc.text(`${num}. ${title}`, 14, y);
        doc.setTextColor(0); doc.setFont("helvetica", "normal");
        y += 5;
      };

      // ── 1. Sales Summary ──
      section("1", "Sales Summary");
      y = autoTable(
        [["Metric", "Value"]],
        [
          ["Period", `${from} to ${to}`],
          ["Total Transactions", String(totals.count)],
          ["Total Revenue", NGN(totals.rev)],
          ["Total Profit", NGN(totals.profit)],
          ["Avg. Transaction Value", totals.count > 0 ? NGN(totals.rev / totals.count) : "—"],
        ],
        { startY: y, styles: { fontSize: 8 }, headStyles: { fillColor: [22, 160, 110] }, columnStyles: { 0: { fontStyle: "bold", cellWidth: 70 } } }
      ) + 8;

      // ── 2. Stock On Hand ──
      section("2", "Current Stock On Hand");
      y = autoTable(
        [["Drug Name", "NAFDAC No.", "Batch", "Expiry", "Qty", "Cost Value"]],
        products.map((p) => [
          p.name, p.nafdac || "—", p.batch || "—",
          p.expiry ? format(new Date(p.expiry), "dd/MM/yyyy") : "—",
          String(p.quantity),
          NGN(p.quantity * p.costPrice),
        ]),
        {
          startY: y, styles: { fontSize: 7 }, headStyles: { fillColor: [22, 160, 110] },
          foot: [["", "", "", "TOTAL STOCK VALUE", "", NGN(stockCostValue)]],
          footStyles: { fillColor: [240, 240, 240], fontStyle: "bold", fontSize: 7 },
        }
      ) + 8;

      // ── 3. Expiry Watch ──
      section("3", "Expiry Watch (sorted: soonest first)");
      const expiredItems = expiryRows.filter((p) => p.days < 0);
      const criticalItems = expiryRows.filter((p) => p.days >= 0 && p.days <= 30);
      const warningItems = expiryRows.filter((p) => p.days > 30 && p.days <= 180);

      if (expiredItems.length > 0 || criticalItems.length > 0) {
        doc.setFontSize(8); doc.setTextColor(180, 50, 50);
        doc.text(
          `⚠  ${expiredItems.length} expired item(s) · ${criticalItems.length} critical (≤30 days) · ${warningItems.length} warning (≤6 months)`,
          14, y
        );
        doc.setTextColor(0);
        y += 5;
      }

      y = autoTable(
        [["Drug Name", "Batch", "Expiry Date", "Days Left", "Status", "Qty"]],
        expiryRows.slice(0, 60).map((p) => [
          p.name, p.batch || "—",
          p.expiry ? format(new Date(p.expiry), "dd/MM/yyyy") : "—",
          p.days < 0 ? `EXPIRED (${-p.days}d ago)` : `${p.days}d`,
          p.status.toUpperCase(),
          String(p.quantity),
        ]),
        {
          startY: y, styles: { fontSize: 7 }, headStyles: { fillColor: [200, 60, 60] },
          didParseCell: (data: any) => {
            if (data.section === "body") {
              const status = data.row.raw[4];
              if (status === "EXPIRED") data.cell.styles.textColor = [180, 50, 50];
              else if (status === "CRITICAL") data.cell.styles.textColor = [200, 100, 0];
            }
          },
        }
      ) + 8;

      // ── 4. Controlled Substances Register ──
      section("4", "Controlled Substances Poisons Register");
      if (dispenses.length === 0) {
        doc.setFontSize(8); doc.setTextColor(100);
        doc.text("No controlled substance dispensing records in this period.", 14, y);
        doc.setTextColor(0); y += 8;
      } else {
        y = autoTable(
          [["Date", "Drug", "Batch", "Qty", "Patient Name", "Phone", "Prescriber", "MDCN Reg", "Rx Ref", "Cashier"]],
          dispenses.map((d) => [
            format(new Date(d.at), "dd/MM/yyyy HH:mm"),
            d.productName, d.batch || "—", String(d.quantity),
            d.patientName, d.patientPhone || "—",
            d.prescriber, d.prescriberRegNo || "—",
            d.prescriptionRef, d.cashier,
          ]),
          {
            startY: y, styles: { fontSize: 6.5 }, headStyles: { fillColor: [140, 30, 30] },
            columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 28 } },
          }
        ) + 8;
      }

      // ── 5. Sales Detail for Period ──
      section("5", `Sales Transactions (${from} to ${to})`);
      y = autoTable(
        [["Date & Time", "Receipt No.", "Items", "Payment", "Cashier", "Customer", "Total (₦)", "Profit (₦)"]],
        inRange.map((s) => [
          format(new Date(s.createdAt), "dd/MM/yy HH:mm"),
          s.id.slice(0, 8).toUpperCase(),
          String(s.items.length),
          s.payment,
          s.cashier,
          s.customer || "Walk-in",
          s.total.toFixed(2),
          s.profit.toFixed(2),
        ]),
        {
          startY: y, styles: { fontSize: 7 }, headStyles: { fillColor: [22, 160, 110] },
          foot: [["", "", "", "", "", "TOTALS", NGN(totals.rev), NGN(totals.profit)]],
          footStyles: { fillColor: [230, 245, 235], fontStyle: "bold", fontSize: 7 },
        }
      ) + 8;

      // ── 6. Audit Trail ──
      section("6", "Audit Trail (most recent 50 entries)");
      y = autoTable(
        [["Timestamp", "User", "Action", "Target", "Detail"]],
        audit.slice(0, 50).map((a) => [
          format(new Date(a.at), "dd/MM/yy HH:mm"),
          a.user, a.action, a.target, a.detail || "—",
        ]),
        { startY: y, styles: { fontSize: 6.5 }, headStyles: { fillColor: [22, 100, 160] } }
      ) + 8;

      // ── Footer on every page ──
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(200); doc.setLineWidth(0.3);
        doc.line(14, pageH - 12, pageW - 14, pageH - 12);
        doc.setFontSize(7); doc.setTextColor(120); doc.setFont("helvetica", "normal");
        doc.text(
          `${settings.name} — PCN Inspection Compliance Report — Page ${i} of ${totalPages}`,
          pageW / 2, pageH - 7, { align: "center" }
        );
        doc.text(
          `CONFIDENTIAL — For authorised regulatory inspection only`,
          pageW / 2, pageH - 3, { align: "center" }
        );
      }

      doc.save(`inspection-report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
      // Dynamic import fallback for environments where the module path differs
      try {
        const jsPDF = (await import("jspdf")).default;
        const doc = new jsPDF();
        const pageW = doc.internal.pageSize.getWidth();
        doc.setFontSize(14); doc.setFont("helvetica", "bold");
        doc.text(settings.name || "Pharmacy", pageW / 2, 20, { align: "center" });
        doc.setFontSize(11);
        doc.text("INSPECTION COMPLIANCE REPORT", pageW / 2, 30, { align: "center" });
        doc.setFontSize(9); doc.setFont("helvetica", "normal");
        doc.text(`Period: ${from} to ${to}`, 14, 45);
        doc.text(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 52);
        doc.text(`Total Transactions: ${totals.count}`, 14, 65);
        doc.text(`Total Revenue: ${NGN(totals.rev)}`, 14, 72);
        doc.text(`Total Profit: ${NGN(totals.profit)}`, 14, 79);
        doc.text(`Total Products: ${products.length}`, 14, 86);
        doc.text(`Controlled Dispenses: ${dispenses.length}`, 14, 93);
        doc.text("NOTE: Install jspdf-autotable for full table support.", 14, 110);
        doc.save(`inspection-report-${format(new Date(), "yyyy-MM-dd")}.pdf`);
      } catch (err2) {
        console.error("Fallback PDF also failed:", err2);
        alert("PDF generation failed. Check browser console for details.");
      }
    } finally {
      setPdfLoading(false);
    }
  };

  // ── Generic export helpers ──
  const exportPDF = async (title: string, head: string[], body: any[][]) => {
    try {
      const { doc, autoTable } = await makePdf();
      doc.setFontSize(14); doc.text(settings.name || "PharmaGuard NG", 14, 14);
      doc.setFontSize(10); doc.text(title, 14, 21);
      doc.text(`Generated ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 27);
      autoTable([head], body, { startY: 32, styles: { fontSize: 9 }, headStyles: { fillColor: [22, 160, 110] } });
      doc.save(`${title.toLowerCase().replace(/\s+/g, "-")}-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    } catch (err) {
      console.error("Export PDF failed:", err);
      alert("PDF export failed. Check browser console.");
    }
  };

  const exportXLSX = (name: string, rows: any[]) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, name);
    XLSX.writeFile(wb, `${name.toLowerCase().replace(/\s+/g, "-")}-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Reports & Compliance</h1>
          <p className="text-sm text-muted-foreground">Generate sales, stock, expiry, movement and statutory inspection reports</p>
        </div>
        <Button onClick={inspectionReadyPdf} disabled={pdfLoading} className="bg-primary hover:bg-primary/90">
          {pdfLoading
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating PDF…</>
            : <><ShieldCheck className="mr-2 h-4 w-4" />Inspection Ready PDF</>
          }
        </Button>
      </div>

      <Card className="shadow-card">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="ml-auto grid grid-cols-3 gap-3 text-sm">
            <Stat label="Revenue" v={NGN(totals.rev)} />
            <Stat label="Profit" v={NGN(totals.profit)} />
            <Stat label="Transactions" v={String(totals.count)} />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="sales">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="profit">Profit</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
          <TabsTrigger value="expiry">Expiry</TabsTrigger>
          <TabsTrigger value="movement">Stock Movement</TabsTrigger>
        </TabsList>

        <TabsContent value="sales">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Sales report</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => exportXLSX("Sales", inRange.map((s) => ({
                  Date: format(new Date(s.createdAt), "yyyy-MM-dd HH:mm"), Receipt: s.id.slice(0,8).toUpperCase(),
                  Items: s.items.length, Total: s.total, Profit: s.profit, Payment: s.payment, Cashier: s.cashier,
                }))}><FileDown className="mr-1 h-4 w-4" />Excel</Button>
                <Button size="sm" variant="outline" onClick={() => exportPDF("Sales Report",
                  ["Date","Receipt","Items","Total","Profit","Payment"],
                  inRange.map((s) => [format(new Date(s.createdAt), "dd MMM HH:mm"), s.id.slice(0,8).toUpperCase(), s.items.length, s.total.toFixed(2), s.profit.toFixed(2), s.payment])
                )}><FileText className="mr-1 h-4 w-4" />PDF</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead>Receipt</TableHead><TableHead>Items</TableHead>
                    <TableHead className="text-right">Total</TableHead><TableHead className="text-right">Profit</TableHead>
                    <TableHead>Payment</TableHead><TableHead>Cashier</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {inRange.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No sales in range</TableCell></TableRow>}
                    {inRange.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-xs">{format(new Date(s.createdAt), "dd MMM yyyy HH:mm")}</TableCell>
                        <TableCell className="text-xs font-mono">{s.id.slice(0,8).toUpperCase()}</TableCell>
                        <TableCell>{s.items.length}</TableCell>
                        <TableCell className="text-right font-medium">{NGN(s.total)}</TableCell>
                        <TableCell className="text-right text-success">{NGN(s.profit)}</TableCell>
                        <TableCell><Badge variant="outline">{s.payment}</Badge></TableCell>
                        <TableCell className="text-xs">{s.cashier}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profit">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Profit by product</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => exportXLSX("Profit", profitRows.map((r) => ({
                  Product: r.name, UnitsSold: r.units, Revenue: r.revenue, Profit: r.profit,
                })))}><FileDown className="mr-1 h-4 w-4" />Excel</Button>
                <Button size="sm" variant="outline" onClick={() => exportPDF("Profit by Product",
                  ["Product","Units","Revenue","Profit"],
                  profitRows.map((r) => [r.name, r.units, r.revenue.toFixed(2), r.profit.toFixed(2)])
                )}><FileText className="mr-1 h-4 w-4" />PDF</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {profitRows.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No sales in range</TableCell></TableRow>}
                    {profitRows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-right">{r.units}</TableCell>
                        <TableCell className="text-right">{NGN(r.revenue)}</TableCell>
                        <TableCell className="text-right text-success">{NGN(r.profit)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stock">
          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            <Badge variant="outline" className="border-info text-info">Stock value (cost): {NGN(stockCostValue)}</Badge>
            <Badge variant="outline" className="border-success text-success">Stock value (retail): {NGN(stockSellValue)}</Badge>
            <Badge variant="outline">Potential margin: {NGN(stockSellValue - stockCostValue)}</Badge>
          </div>
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Stock report</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => exportXLSX("Stock", products.map((p) => ({
                  Name: p.name, Generic: p.generic, NAFDAC: p.nafdac, Batch: p.batch, Expiry: p.expiry,
                  Quantity: p.quantity, Cost: p.costPrice, Price: p.sellingPrice, Value: p.quantity * p.costPrice, Supplier: p.supplier,
                })))}><FileDown className="mr-1 h-4 w-4" />Excel</Button>
                <Button size="sm" variant="outline" onClick={() => exportPDF("Stock Report",
                  ["Name","NAFDAC","Batch","Expiry","Qty","Cost","Price"],
                  products.map((p) => [p.name, p.nafdac, p.batch, p.expiry, p.quantity, p.costPrice, p.sellingPrice])
                )}><FileText className="mr-1 h-4 w-4" />PDF</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Name</TableHead><TableHead>NAFDAC</TableHead><TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Value</TableHead><TableHead>Supplier</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {products.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell><div className="font-medium">{p.name}</div><div className="text-xs text-muted-foreground">{p.generic}</div></TableCell>
                        <TableCell className="text-xs">{p.nafdac}</TableCell>
                        <TableCell className="text-right">{p.quantity}</TableCell>
                        <TableCell className="text-right">{NGN(p.quantity * p.costPrice)}</TableCell>
                        <TableCell className="text-xs">{p.supplier}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expiry">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Expiry report</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => exportXLSX("Expiry", expiryRows.map((p) => ({
                  Name: p.name, Batch: p.batch, Expiry: p.expiry, DaysLeft: p.days, Status: p.status, Quantity: p.quantity,
                })))}><FileDown className="mr-1 h-4 w-4" />Excel</Button>
                <Button size="sm" variant="outline" onClick={() => exportPDF("Expiry Report",
                  ["Name","Batch","Expiry","Days","Status","Qty"],
                  expiryRows.map((p) => [p.name, p.batch, p.expiry, p.days, p.status, p.quantity])
                )}><FileText className="mr-1 h-4 w-4" />PDF</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Name</TableHead><TableHead>Batch</TableHead><TableHead>Expiry</TableHead>
                    <TableHead>Status</TableHead><TableHead className="text-right">Qty</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {expiryRows.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-xs">{p.batch}</TableCell>
                        <TableCell className="text-xs">
                          {p.expiry ? format(new Date(p.expiry), "dd MMM yyyy") : "—"}
                          <span className="text-muted-foreground ml-1">({p.days < 0 ? `${-p.days}d ago` : `${p.days}d`})</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            p.status === "expired" || p.status === "critical" ? "border-destructive text-destructive" :
                            p.status === "warning" ? "border-warning text-warning" : "border-success text-success"
                          }>{p.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{p.quantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movement">
          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">Stock movement ({from} → {to})</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => exportXLSX("Stock-Movement", movementRows.map((r) => ({
                  Product: r.name, Batch: r.batch, OpeningStock: r.opening, UnitsSold: r.sold, ClosingStock: r.closing, Revenue: r.revenue,
                })))}><FileDown className="mr-1 h-4 w-4" />Excel</Button>
                <Button size="sm" variant="outline" onClick={() => exportPDF("Stock Movement",
                  ["Product","Batch","Opening","Sold","Closing","Revenue"],
                  movementRows.map((r) => [r.name, r.batch, r.opening, r.sold, r.closing, r.revenue.toFixed(2)])
                )}><FileText className="mr-1 h-4 w-4" />PDF</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Product</TableHead><TableHead>Batch</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Sold</TableHead>
                    <TableHead className="text-right">Closing</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {movementRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-xs">{r.batch}</TableCell>
                        <TableCell className="text-right">{r.opening}</TableCell>
                        <TableCell className="text-right font-medium">{r.sold}</TableCell>
                        <TableCell className="text-right">{r.closing}</TableCell>
                        <TableCell className="text-right">{NGN(r.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div className="rounded-md border bg-muted/40 px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-semibold">{v}</div>
    </div>
  );
}
