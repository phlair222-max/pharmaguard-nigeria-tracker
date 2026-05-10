import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/lib/store";
import { format, startOfDay } from "date-fns";
import { FileDown, History, Search } from "lucide-react";

export default function Audit() {
  const audit = useStore((s) => s.audit);
  const [from, setFrom] = useState(format(new Date(Date.now() - 6 * 86400000), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [actionFilter, setActionFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const [q, setQ] = useState("");

  const users = useMemo(() => Array.from(new Set(audit.map((a) => a.user))), [audit]);
  const actions = useMemo(() => Array.from(new Set(audit.map((a) => a.action))), [audit]);

  const filtered = useMemo(() => {
    const f = startOfDay(new Date(from)).getTime();
    const t = startOfDay(new Date(to)).getTime() + 86400000;
    const ql = q.trim().toLowerCase();
    return audit.filter((a) => {
      const x = new Date(a.at).getTime();
      if (x < f || x >= t) return false;
      if (actionFilter !== "all" && a.action !== actionFilter) return false;
      if (userFilter !== "all" && a.user !== userFilter) return false;
      if (ql && !`${a.action} ${a.target} ${a.detail || ""} ${a.user}`.toLowerCase().includes(ql)) return false;
      return true;
    });
  }, [audit, from, to, actionFilter, userFilter, q]);

  const exportCsv = () => {
    const rows = [
      ["When","User","Action","Target","Detail"].join(","),
      ...filtered.map((a) => [
        format(new Date(a.at), "yyyy-MM-dd HH:mm:ss"), a.user, a.action, a.target, a.detail || "",
      ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `audit-trail-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <History className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Audit Trail</h1>
          <p className="text-sm text-muted-foreground">Tamper-evident log of every action — required for PCN inspection</p>
        </div>
      </div>

      <Card className="shadow-card">
        <CardContent className="grid grid-cols-2 gap-3 p-4 md:grid-cols-6">
          <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div>
            <Label className="text-xs">Action</Label>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {actions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">User</Label>
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {users.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-7" placeholder="Search target, detail..." value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>
          <div className="col-span-2 flex items-end justify-end md:col-span-6">
            <Button size="sm" variant="outline" onClick={exportCsv}><FileDown className="mr-1.5 h-4 w-4" />Export CSV</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-2"><CardTitle className="text-base">Activity ({filtered.length} of {audit.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>When</TableHead><TableHead>User</TableHead><TableHead>Action</TableHead>
                <TableHead>Target</TableHead><TableHead>Detail</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No activity matches filters</TableCell></TableRow>}
                {filtered.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap text-xs">{format(new Date(a.at), "dd MMM yyyy HH:mm:ss")}</TableCell>
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
