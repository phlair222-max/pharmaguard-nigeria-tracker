import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { store, useStore } from "@/lib/store";
import { toast } from "sonner";
import { Building2 } from "lucide-react";

export default function Settings() {
  const settings = useStore((s) => s.settings);
  const [draft, setDraft] = useState(settings);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Pharmacy Settings</h1>
        <p className="text-sm text-muted-foreground">These details appear on every printed receipt</p>
      </div>
      <Card className="shadow-card">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2 pb-2 text-sm text-muted-foreground"><Building2 className="h-4 w-4" /> Pharmacy details</div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Pharmacy name</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
            <div className="col-span-2"><Label>Address</Label><Textarea rows={2} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></div>
            <div><Label>Email</Label><Input value={draft.email || ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
            <div className="col-span-2"><Label>Premise / PCN License</Label><Input value={draft.premiseLicense || ""} onChange={(e) => setDraft({ ...draft, premiseLicense: e.target.value })} /></div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => { store.updateSettings(draft); toast.success("Settings saved"); }}>Save changes</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
