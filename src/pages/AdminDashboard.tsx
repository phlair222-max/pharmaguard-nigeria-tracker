import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Building2,
  Users,
  Package,
  TrendingUp,
  ShieldCheck,
  Eye,
  Trash2,
  RefreshCw,
  LogIn,
  AlertTriangle,
} from "lucide-react";

const ADMIN_EMAIL = "phlair222@gmail.com";

type OrgRow = {
  id: string;
  name: string;
  owner_id: string;
  owner_email: string;
  status: string;
  subscription_tier: string;
  subscription_expires_at: string | null;
  created_at: string;
  member_count: number;
  product_count: number;
  sales_total: number;
};

const TIERS = ["free", "basic", "pro"];

function tierColor(tier: string) {
  if (tier === "pro") return "bg-violet-500/15 text-violet-400 border-violet-500/30";
  if (tier === "basic") return "bg-blue-500/15 text-blue-400 border-blue-500/30";
  return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
}

function statusColor(status: string) {
  if (status === "active") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (status === "suspended") return "bg-red-500/15 text-red-400 border-red-500/30";
  return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
}

export default function AdminDashboard() {
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [impersonating, setImpersonating] = useState<OrgRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrgRow | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Gate: only render for the platform admin
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setIsAdmin(data.user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());
    });
  }, []);

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all organizations
      const { data: orgData, error: orgErr } = await supabase
        .from("organizations")
        .select("*")
        .order("created_at", { ascending: false });
      if (orgErr) throw orgErr;

      // For each org, fetch counts + owner email in parallel
      const enriched = await Promise.all(
        (orgData || []).map(async (org) => {
          const [membersR, productsR, salesR, ownerR] = await Promise.all([
            supabase
              .from("memberships")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", org.id)
              .eq("status", "active"),
            supabase
              .from("products")
              .select("id", { count: "exact", head: true })
              .eq("organization_id", org.id),
            supabase
              .from("sales")
              .select("total")
              .eq("organization_id", org.id),
            // owner email via profiles (email stored there)
            supabase
              .from("profiles")
              .select("email")
              .eq("id", org.owner_id)
              .maybeSingle(),
          ]);

          const sales_total = ((salesR.data || []) as { total: number }[]).reduce(
            (acc, s) => acc + (s.total || 0),
            0
          );

          return {
            ...org,
            owner_email: (ownerR.data as { email?: string } | null)?.email || org.owner_id,
            member_count: membersR.count || 0,
            product_count: productsR.count || 0,
            sales_total,
          } as OrgRow;
        })
      );

      setOrgs(enriched);
    } catch (e: unknown) {
      toast.error("Failed to load organizations: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) fetchOrgs();
  }, [isAdmin, fetchOrgs]);

  const updateOrg = async (
    org: OrgRow,
    patch: Partial<Pick<OrgRow, "status" | "subscription_tier" | "subscription_expires_at">>
  ) => {
    setUpdatingId(org.id);
    const { error } = await supabase
      .from("organizations")
      .update(patch)
      .eq("id", org.id);
    if (error) {
      toast.error("Update failed: " + error.message);
    } else {
      toast.success("Organization updated");
      setOrgs((prev) =>
        prev.map((o) => (o.id === org.id ? { ...o, ...patch } : o))
      );
    }
    setUpdatingId(null);
  };

  const deleteOrg = async (org: OrgRow) => {
    const { error } = await supabase.from("organizations").delete().eq("id", org.id);
    if (error) {
      toast.error("Delete failed: " + error.message);
    } else {
      toast.success(`"${org.name}" deleted`);
      setOrgs((prev) => prev.filter((o) => o.id !== org.id));
    }
    setDeleteTarget(null);
  };

  // ── Stats ─────────────────────────────────────────────────
  const totalOrgs = orgs.length;
  const activeOrgs = orgs.filter((o) => o.status === "active").length;
  const totalRevenue = orgs.reduce((a, o) => a + o.sales_total, 0);
  const proOrgs = orgs.filter((o) => o.subscription_tier === "pro").length;

  // ── Filter ────────────────────────────────────────────────
  const filtered = orgs.filter(
    (o) =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.owner_email.toLowerCase().includes(search.toLowerCase())
  );

  // ── Guard ─────────────────────────────────────────────────
  if (isAdmin === null) return null;
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <ShieldCheck className="h-12 w-12 opacity-30" />
        <p className="text-lg font-medium">Access denied</p>
        <p className="text-sm">This page is restricted to platform administrators.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Impersonation banner */}
      {impersonating && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <span className="text-sm text-amber-300 flex-1">
            Viewing as <strong>{impersonating.name}</strong> — this is a read-only preview of their org data.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
            onClick={() => setImpersonating(null)}
          >
            Exit view
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform Admin</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            All pharmacies on PharmaGuard NG
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchOrgs}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total pharmacies", value: totalOrgs, icon: Building2, color: "text-blue-400" },
          { label: "Active", value: activeOrgs, icon: ShieldCheck, color: "text-emerald-400" },
          { label: "Pro tier", value: proOrgs, icon: TrendingUp, color: "text-violet-400" },
          {
            label: "Platform revenue",
            value: `₦${totalRevenue.toLocaleString()}`,
            icon: TrendingUp,
            color: "text-amber-400",
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="rounded-xl border bg-card p-4 space-y-2"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <Icon className={`h-4 w-4 ${color}`} />
              <span className="text-xs">{label}</span>
            </div>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <Input
        placeholder="Search by pharmacy name or owner email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading organizations…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No organizations found.
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Pharmacy</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium text-center">
                  <Users className="h-3.5 w-3.5 inline mr-1" />Staff
                </th>
                <th className="px-4 py-3 font-medium text-center">
                  <Package className="h-3.5 w-3.5 inline mr-1" />Products
                </th>
                <th className="px-4 py-3 font-medium text-right">Sales</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Tier</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((org) => (
                <tr
                  key={org.id}
                  className="border-b last:border-0 hover:bg-muted/20 transition-colors"
                >
                  <td className="px-4 py-3 font-medium max-w-[160px] truncate">
                    {org.name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-[180px] truncate text-xs">
                    {org.owner_email}
                  </td>
                  <td className="px-4 py-3 text-center">{org.member_count}</td>
                  <td className="px-4 py-3 text-center">{org.product_count}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    ₦{org.sales_total.toLocaleString()}
                  </td>

                  {/* Status toggle */}
                  <td className="px-4 py-3">
                    <Select
                      value={org.status}
                      onValueChange={(v) => updateOrg(org, { status: v })}
                      disabled={updatingId === org.id}
                    >
                      <SelectTrigger className="h-7 w-[110px] text-xs border-0 bg-transparent p-0 focus:ring-0">
                        <Badge className={`text-xs border ${statusColor(org.status)}`}>
                          {org.status}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">active</SelectItem>
                        <SelectItem value="suspended">suspended</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>

                  {/* Tier select */}
                  <td className="px-4 py-3">
                    <Select
                      value={org.subscription_tier}
                      onValueChange={(v) => updateOrg(org, { subscription_tier: v })}
                      disabled={updatingId === org.id}
                    >
                      <SelectTrigger className="h-7 w-[90px] text-xs border-0 bg-transparent p-0 focus:ring-0">
                        <Badge className={`text-xs border ${tierColor(org.subscription_tier)}`}>
                          {org.subscription_tier}
                        </Badge>
                      </SelectTrigger>
                      <SelectContent>
                        {TIERS.map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>

                  {/* Expiry date */}
                  <td className="px-4 py-3">
                    <input
                      type="date"
                      className="text-xs bg-transparent border-0 text-muted-foreground focus:outline-none focus:ring-0 w-[110px]"
                      value={org.subscription_expires_at?.slice(0, 10) ?? ""}
                      onChange={(e) =>
                        updateOrg(org, {
                          subscription_expires_at: e.target.value
                            ? new Date(e.target.value).toISOString()
                            : null,
                        })
                      }
                    />
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="View as this org"
                        onClick={() => {
                          setImpersonating(org);
                          toast.info(`Now previewing "${org.name}"`);
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        title="Open app as this org owner"
                        onClick={() => {
                          // Copy org ID to clipboard for manual session switch
                          navigator.clipboard.writeText(org.owner_email);
                          toast.info(`Owner email copied: ${org.owner_email}`);
                        }}
                      >
                        <LogIn className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        title="Delete organization"
                        onClick={() => setDeleteTarget(org)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirm dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the organization and cascades to all their products,
              sales, suppliers, and audit logs. This cannot be undone.
              Consider suspending instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => deleteTarget && deleteOrg(deleteTarget)}
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
