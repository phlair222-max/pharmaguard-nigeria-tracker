import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, Truck, RotateCcw } from "lucide-react";
import { store, useStore, Supplier } from "@/lib/store";
import { toast } from "sonner";
import { usePlan } from "@/lib/store";
import { UpgradePrompt } from "@/components/UpgradePrompt";

const empty: Omit<Supplier, "id"> = { name: "", contactPerson: "", phone: "", email: "", address: "", notes: "" };

export default function Suppliers() {
  const suppliers = useStore((s) => s.suppliers);
  const products = useStore((s) => s.products);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [draft, setDraft] = useState<Omit<Supplier, "id">>(empty);
  // STEP 12b: archived suppliers are hidden unless the Owner asks to see them.
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Only the Owner can delete, archive or restore (the database enforces this too).
  const isOwner = useStore((s) => s.user?.memberRole === "Owner");

  const isArchived = (s: Supplier) => s.active === false;
  const archivedCount = suppliers.filter(isArchived).length;

  // Same matching rule the database uses: by supplier id, or by name
  // ignoring capital letters and extra spaces.
  const norm = (v?: string) => (v || "").trim().toLowerCase();
  const linkedCount = (s: Supplier) =>
    products.filter((p) => p.supplierId === s.id || (norm(p.supplier) !== "" && norm(p.supplier) === norm(s.name))).length;

  const list = suppliers.filter((s) => {
    if (!showArchived && isArchived(s)) return false;
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
  // STEP 12b: the database decides between delete and archive, and the
  // message shown afterwards reports what it ACTUALLY did.
  const remove = async (s: Supplier) => {
    const count = linkedCount(s);
    const message = count > 0
      ? `Archive supplier "${s.name}"?\n\n${count} product(s) are linked to this supplier, so it cannot be deleted. It will be hidden from this list but kept on record. You can restore it later.`
      : `Delete supplier "${s.name}" permanently?\n\nNo products are linked to it. If the system finds a linked product (for example an archived one), the supplier will be archived instead of deleted.`;
    if (!confirm(message)) return;
    setBusyId(s.id);
    const result = await store.deleteSupplier(s.id);
    setBusyId(null);
    if (!result.ok) { toast.error(`Could not remove supplier: ${result.error}`); return; }
    toast.success(result.outcome === "archived"
      ? `"${s.name}" archived — hidden from the list, record kept`
      : `"${s.name}" deleted`);
  };
  const restore = (s: Supplier) => { store.restoreSupplier(s.id); toast.success(`"${s.name}" restored`); };


  const plan = usePlan();
  if (!plan.canSuppliers) return <div className="p-6"><UpgradePrompt feature="Suppliers Module" requiredPlan="basic" description="Manage your supplier list, track orders, and link products to their source." /></div>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Suppliers</h1>
          <p className="text-sm text-muted-foreground">Manage suppliers and link them to products</p>
        </div>
        <div className="flex items-center gap-2">
          {(archivedCount > 0 || showArchived) && (
            <Button size="sm" variant="outline" onClick={() => setShowArchived((v) => !v)}>
              {showArchived ? "Hide archived" : `Show archived (${archivedCount})`}
            </Button>
          )}
          <Button size="sm" onClick={openNew}><Plus className="mr-2 h-4 w-4" />Add Supplier</Button>
        </div>
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
                  const count = linkedCount(s);
                  const archived = isArchived(s);
                  return (
                    <TableRow key={s.id} className={archived ? "opacity-60" : undefined}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary"><Truck className="h-4 w-4" /></div>
                          <div className="font-medium">{s.name}</div>
                          {archived && <Badge variant="secondary">Archived</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">{s.contactPerson}</TableCell>
                      <TableCell className="text-xs">{s.phone}</TableCell>
                      <TableCell className="text-xs">{s.email}</TableCell>
                      <TableCell><Badge variant="outline">{count}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                          {isOwner && !archived && (
                            <Button size="icon" variant="ghost" title="Delete or archive" disabled={busyId === s.id} onClick={() => remove(s)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                          )}
                          {isOwner && archived && (
                            <Button size="icon" variant="ghost" title="Restore" onClick={() => restore(s)}><RotateCcw className="h-4 w-4" /></Button>
                          )}
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
