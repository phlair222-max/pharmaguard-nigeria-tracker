import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useStore } from "@/lib/store";
import { format } from "date-fns";

export default function Audit() {
  const audit = useStore((s) => s.audit);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Audit Trail</h1>
        <p className="text-sm text-muted-foreground">Complete log of who did what and when</p>
      </div>
      <Card className="shadow-card">
        <CardHeader><CardTitle className="text-base">Recent activity ({audit.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>When</TableHead><TableHead>User</TableHead><TableHead>Action</TableHead>
                <TableHead>Target</TableHead><TableHead>Detail</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {audit.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No activity yet</TableCell></TableRow>}
                {audit.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-xs">{format(new Date(a.at), "dd MMM yyyy HH:mm:ss")}</TableCell>
                    <TableCell className="text-xs font-medium">{a.user}</TableCell>
                    <TableCell className="text-xs">{a.action}</TableCell>
                    <TableCell className="text-xs">{a.target}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{a.detail}</TableCell>
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
