import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useStore } from "@/lib/store";
import { NGN } from "@/lib/format";
import { format } from "date-fns";
import { ShieldAlert } from "lucide-react";

export default function Poisons() {
  const products = useStore((s) => s.products);
  const sales = useStore((s) => s.sales);
  const controlled = products.filter((p) => p.controlled);
  const controlledIds = new Set(controlled.map((p) => p.id));
  const dispensed = sales.flatMap((s) =>
    s.items.filter((i) => controlledIds.has(i.productId)).map((i) => ({ ...i, sale: s }))
  ).slice(0, 100);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Poisons / Controlled Register</h1>
          <p className="text-sm text-muted-foreground">Statutory record of controlled substances and dispensing log</p>
        </div>
      </div>

      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">Controlled substances on hand</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>NAFDAC</TableHead><TableHead>Batch</TableHead>
              <TableHead className="text-right">Stock</TableHead><TableHead>Expiry</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {controlled.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No controlled substances on file</TableCell></TableRow>}
              {controlled.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-xs">{p.nafdac}</TableCell>
                  <TableCell className="text-xs">{p.batch}</TableCell>
                  <TableCell className="text-right">{p.quantity}</TableCell>
                  <TableCell className="text-xs">{format(new Date(p.expiry), "dd MMM yyyy")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">Recent dispensing log</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Drug</TableHead><TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Amount</TableHead><TableHead>Customer</TableHead><TableHead>Cashier</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {dispensed.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No dispensings recorded</TableCell></TableRow>}
              {dispensed.map((d, i) => (
                <TableRow key={i}>
                  <TableCell className="text-xs">{format(new Date(d.sale.createdAt), "dd MMM HH:mm")}</TableCell>
                  <TableCell><Badge variant="outline" className="border-destructive text-destructive">{d.name}</Badge></TableCell>
                  <TableCell className="text-right">{d.qty}</TableCell>
                  <TableCell className="text-right">{NGN(d.qty * d.price)}</TableCell>
                  <TableCell className="text-xs">{d.sale.customer || "Walk-in"}</TableCell>
                  <TableCell className="text-xs">{d.sale.cashier}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
