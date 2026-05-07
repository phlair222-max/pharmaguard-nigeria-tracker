import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { store, useStore } from "@/lib/store";
import { toast } from "sonner";
import { Building2, Upload, ImageIcon, User } from "lucide-react";

async function fileToDataUrl(file: File, max = 400): Promise<string> {
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  return await new Promise<string>((res) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d")!.drawImage(img, 0, 0, w, h);
      res(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => res(dataUrl);
    img.src = dataUrl;
  });
}

export default function Settings() {
  const settings = useStore((s) => s.settings);
  const [draft, setDraft] = useState(settings);
  const logoRef = useRef<HTMLInputElement>(null);
  const ownerRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File | undefined, key: "logo" | "ownerPhoto") => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    const url = await fileToDataUrl(file, 400);
    setDraft((d) => ({ ...d, [key]: url }));
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Pharmacy Settings</h1>
        <p className="text-sm text-muted-foreground">These details appear in the sidebar, dashboard, and on every printed receipt</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="shadow-card">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 pb-1 text-sm font-medium"><ImageIcon className="h-4 w-4 text-primary" /> Pharmacy Logo</div>
            <p className="text-xs text-muted-foreground">Square image. Shown in sidebar, dashboard header, and printed receipts.</p>
            <div className="flex items-center gap-4">
              {draft.logo ? (
                <img src={draft.logo} alt="logo" className="h-24 w-24 rounded-lg object-cover border bg-white" />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-lg border bg-muted text-muted-foreground"><ImageIcon className="h-8 w-8" /></div>
              )}
              <div className="space-y-2">
                <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0] || undefined, "logo")} />
                <Button type="button" size="sm" variant="outline" onClick={() => logoRef.current?.click()}>
                  <Upload className="mr-1.5 h-3.5 w-3.5" />Upload logo
                </Button>
                {draft.logo && <Button type="button" size="sm" variant="ghost" onClick={() => setDraft({ ...draft, logo: "" })}>Remove</Button>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 pb-1 text-sm font-medium"><User className="h-4 w-4 text-primary" /> Pharmacist-in-Charge Photo</div>
            <p className="text-xs text-muted-foreground">Photo of the pharmacy owner / superintendent pharmacist.</p>
            <div className="flex items-center gap-4">
              {draft.ownerPhoto ? (
                <img src={draft.ownerPhoto} alt="owner" className="h-24 w-24 rounded-full object-cover border" />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full border bg-muted text-muted-foreground"><User className="h-8 w-8" /></div>
              )}
              <div className="space-y-2 flex-1">
                <Input placeholder="Pharmacist name" value={draft.ownerName || ""} onChange={(e) => setDraft({ ...draft, ownerName: e.target.value })} />
                <input ref={ownerRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0] || undefined, "ownerPhoto")} />
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => ownerRef.current?.click()}>
                    <Upload className="mr-1.5 h-3.5 w-3.5" />Upload photo
                  </Button>
                  {draft.ownerPhoto && <Button type="button" size="sm" variant="ghost" onClick={() => setDraft({ ...draft, ownerPhoto: "" })}>Remove</Button>}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2 pb-2 text-sm font-medium"><Building2 className="h-4 w-4 text-primary" /> Pharmacy Details</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2"><Label>Pharmacy name</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Address</Label><Textarea rows={2} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></div>
            <div><Label>Phone</Label><Input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></div>
            <div><Label>Email</Label><Input value={draft.email || ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></div>
            <div className="md:col-span-2"><Label>Premise / PCN License</Label><Input value={draft.premiseLicense || ""} onChange={(e) => setDraft({ ...draft, premiseLicense: e.target.value })} /></div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => { store.updateSettings(draft); toast.success("Settings saved"); }}>Save changes</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
