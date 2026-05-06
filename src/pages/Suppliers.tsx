import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, Truck } from "lucide-react";
import { store, useStore, Supplier } from "@/lib/store";
import { toast } from "sonner";

const empty: Omit<Supplier, "id"> = { name: "", contactPerson: "", phone: "", email: "", address: "", notes: "" };

export default function Suppliers() {
  const suppliers = useStore((s) => s.suppliers);
  const products = useStore((s) => s.products);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [draft, setDraft] = useState<Omit<Supplier, "id">>(empty);

  const list = suppliers.filter((s) => {
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return s.name.toLowerCase().includes(t) || (s.contactPerson || "").toLowerCase().includes(t) || (s.phone || "").includes(t);
  });

  const openNew = () => { setEditing(null); setDraft(empty); setOpen(true); };
  const openEdit = (s: Supplier) => { setEditing(s); setDraft({ ...s }); setOpen(true); };
  const save = () => {
    if (!draft.name) { toast.error("Supplier name is required"); return; }
    if (editing) { store.updateSupplier(editing.id, draft); toast.success("Supplier updated"); }
    else { store.addSupplier(draft); toast.success("Supplier added"); }
    setOpen(false);
  };
  const remove = (s: Supplier) => { if (confirm(`Delete supplier ${s.name}?`)) { store.deleteSupplier(s.id); toast.success("Deleted"); } };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Suppliers</h1>
          <p className="text-sm text-muted-foreground">Manage suppliers and link them to products</p>
        </div>
        <Button size="sm" onClick={openNew}><Plus className="mr-2 h-4 w-4" />Add Supplier</Button>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search suppliers..." className="pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Supplier</TableHead><TableHead>Contact</TableHead><TableHead>Phone</TableHead>
                <TableHead>Email</TableHead><TableHead>Products</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {list.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No suppliers</TableCell></TableRow>}
                {list.map((s) => {
                  const count = products.filter((p) => p.supplierId === s.id || p.supplier === s.name).length;
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary"><Truck className="h-4 w-4" /></div>
                          <div className="font-medium">{s.name}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{s.contactPerson}</TableCell>
                      <TableCell className="text-xs">{s.phone}</TableCell>
                      <TableCell className="text-xs">{s.email}</TableCell>
                      <TableCell><Badge variant="outline">{count}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" onClick={() => remove(s)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Edit Supplier" : "Add Supplier"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <F label="Supplier name" v={draft.name} on={(v) => setDraft({ ...draft, name: v })} />
            <F label="Contact person" v={draft.contactPerson || ""} on={(v) => setDraft({ ...draft, contactPerson: v })} />
            <F label="Phone" v={draft.phone || ""} on={(v) => setDraft({ ...draft, phone: v })} />
            <F label="Email" v={draft.email || ""} on={(v) => setDraft({ ...draft, email: v })} />
            <div className="col-span-2"><Label>Address</Label><Input value={draft.address || ""} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></div>
            <div className="col-span-2"><Label>Notes</Label><Textarea rows={2} value={draft.notes || ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>{editing ? "Save" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function F({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return <div><Label>{label}</Label><Input value={v} onChange={(e) => on(e.target.value)} /></div>;
}
