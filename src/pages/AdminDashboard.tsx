import { useEffect, useState, useCallback } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  Save,
  KeyRound,
  Plus,
  Copy,
  Ban,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Check,
} from "lucide-react";
import {
  ALL_SCOPES,
  type ApiScope,
  type ApiKey,
  type ApiClientOrg,
  createApiOnlyOrg,
  listApiClientOrgs,
  setOrgApiAccess,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  reactivateApiKey,
  getMonthlyUsage,
  setOrgQuota,
} from "@/lib/apiKeyUtils";

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

type PlanRow = {
  tier: string;
  display_name: string;
  price_monthly: number;
  seat_price_monthly: number | null;
  max_products: number;
  max_staff: number;
  max_sales_history_days: number;
  can_ai_forecast: boolean;
  can_poisons_register: boolean;
  can_reports: boolean;
  can_suppliers: boolean;
  can_audit_trail: boolean;
};

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
            All pharmacies and API clients on PharmaGuard NG
          </p>
        </div>
      </div>

      <Tabs defaultValue="pharmacies" className="w-full">
        <TabsList>
          <TabsTrigger value="pharmacies" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" />
            Pharmacies
          </TabsTrigger>
          <TabsTrigger value="plans" className="gap-1.5">
            <Save className="h-3.5 w-3.5" />
            Plan Config
          </TabsTrigger>
          <TabsTrigger value="api" className="gap-1.5">
            <KeyRound className="h-3.5 w-3.5" />
            API Clients
          </TabsTrigger>
        </TabsList>

        {/* ── PHARMACIES TAB ─────────────────────────────────────────── */}
        <TabsContent value="pharmacies" className="space-y-4 mt-4">
          <div className="flex items-center justify-end">
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
        </TabsContent>

        {/* ── PLAN CONFIG TAB ────────────────────────────────────────── */}
        <TabsContent value="plans" className="mt-4">
          <PlanConfigTab />
        </TabsContent>

        {/* ── API CLIENTS TAB ────────────────────────────────────────── */}
        <TabsContent value="api" className="mt-4">
          <ApiClientsTab />
        </TabsContent>
      </Tabs>

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

// ── Plan Config Tab ───────────────────────────────────────────────────────────
function PlanConfigTab() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    (supabase.from as any)("plan_config").select("*").order("price_monthly")
      .then(({ data }: any) => { if (data) setPlans(data); });
  }, []);

  const update = (tier: string, field: keyof PlanRow, value: any) => {
    setPlans((prev) => prev.map((p) => p.tier === tier ? { ...p, [field]: value } : p));
  };

  const save = async (plan: PlanRow) => {
    setSaving(plan.tier);
    const { error } = await (supabase.from as any)("plan_config")
      .update({
        display_name: plan.display_name,
        price_monthly: plan.price_monthly,
        seat_price_monthly: plan.seat_price_monthly,
        max_products: plan.max_products,
        max_staff: plan.max_staff,
        max_sales_history_days: plan.max_sales_history_days,
        can_ai_forecast: plan.can_ai_forecast,
        can_poisons_register: plan.can_poisons_register,
        can_reports: plan.can_reports,
        can_suppliers: plan.can_suppliers,
        can_audit_trail: plan.can_audit_trail,
        updated_at: new Date().toISOString(),
      })
      .eq("tier", plan.tier);
    setSaving(null);
    if (error) { toast.error("Failed to save: " + error.message); return; }
    toast.success(`${plan.display_name} plan saved`);
  };

  const tierColor = (tier: string) => {
    if (tier === "pro") return "border-violet-500/40 bg-violet-500/5";
    if (tier === "basic") return "border-blue-500/40 bg-blue-500/5";
    return "border-zinc-500/40";
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Plan Configuration</h2>
        <p className="text-sm text-muted-foreground">Edit pricing and feature limits for each pharmacy subscription tier (Free / Basic / Pro). This does not affect API Clients — those are configured separately in the API Clients tab.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {plans.filter((p) => p.tier !== "api_only").map((plan) => (
          <div key={plan.tier} className={`rounded-xl border p-4 space-y-4 ${tierColor(plan.tier)}`}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold capitalize">{plan.display_name}</h3>
              <Badge variant="outline" className="text-xs capitalize">{plan.tier}</Badge>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="text-xs">Monthly Price (₦)</Label>
                <Input
                  type="number"
                  value={plan.price_monthly}
                  onChange={(e) => update(plan.tier, "price_monthly", Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">Max Products</Label>
                  <Input
                    type="number"
                    value={plan.max_products}
                    onChange={(e) => update(plan.tier, "max_products", Number(e.target.value))}
                    className="mt-1"
                    placeholder="-1=∞"
                  />
                </div>
                <div>
                  <Label className="text-xs">Included Staff</Label>
                  <Input
                    type="number"
                    value={plan.max_staff}
                    onChange={(e) => update(plan.tier, "max_staff", Number(e.target.value))}
                    className="mt-1"
                    placeholder="-1=∞"
                  />
                </div>
                <div>
                  <Label className="text-xs">History (days)</Label>
                  <Input
                    type="number"
                    value={plan.max_sales_history_days}
                    onChange={(e) => update(plan.tier, "max_sales_history_days", Number(e.target.value))}
                    className="mt-1"
                    placeholder="-1=∞"
                  />
                </div>
              </div>

              {/* incremental per-seat price, used by create-staff-seat once
                  a staff member goes beyond "Included Staff" above */}
              <div>
                <Label className="text-xs">Extra Seat Price (₦/month)</Label>
                <Input
                  type="number"
                  value={plan.seat_price_monthly ?? ""}
                  onChange={(e) => update(plan.tier, "seat_price_monthly", e.target.value ? Number(e.target.value) : null)}
                  className="mt-1"
                  placeholder="Not set — seats beyond the included count can't be charged yet"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Charged per staff member beyond "Included Staff" above. Leave blank to block adding extra seats on this tier until priced.
                </p>
              </div>

              <div className="space-y-2 pt-1">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Features</Label>
                {([
                  ["can_reports", "Reports & Exports"],
                  ["can_suppliers", "Suppliers Module"],
                  ["can_poisons_register", "Poisons Register"],
                  ["can_audit_trail", "Audit Trail"],
                  ["can_ai_forecast", "AI Forecast"],
                ] as [keyof PlanRow, string][]).map(([field, label]) => (
                  <div key={field} className="flex items-center justify-between">
                    <Label className="text-xs font-normal">{label}</Label>
                    <Switch
                      checked={!!plan[field]}
                      onCheckedChange={(v) => update(plan.tier, field, v)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <Button
              className="w-full gap-2"
              size="sm"
              onClick={() => save(plan)}
              disabled={saving === plan.tier}
            >
              <Save className="h-3.5 w-3.5" />
              {saving === plan.tier ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Tip: set max values to -1 for unlimited. Existing sessions reload plan config on next login.</p>
    </div>
  );
}

// ── API Clients Tab ────────────────────────────────────────────────────────────
// Standalone B2B product — completely separate from pharmacy app subscriptions.
// API clients (hospitals, chains, developers) never log into the pharmacy app.
// They exist here only: create the client, flip access on, generate a key,
// hand the key to the client. No pharmacy owner ever sees this tab or these orgs.
function ApiClientsTab() {
  const [orgs, setOrgs] = useState<ApiClientOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewOrgForm, setShowNewOrgForm] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgEmail, setNewOrgEmail] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [usage, setUsage] = useState<Record<string, number>>({});
  const [editingQuotaId, setEditingQuotaId] = useState<string | null>(null);
  const [quotaDraft, setQuotaDraft] = useState<string>("");
  const [savingQuotaId, setSavingQuotaId] = useState<string | null>(null);

  const fetchOrgs = useCallback(async () => {
    setLoading(true);
    try {
      const [orgData, usageData] = await Promise.all([
        listApiClientOrgs(),
        getMonthlyUsage(),
      ]);
      setOrgs(orgData);
      setUsage(usageData);
    } catch (e: unknown) {
      toast.error("Failed to load API clients: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrgs(); }, [fetchOrgs]);

  const startEditQuota = (org: ApiClientOrg) => {
    setEditingQuotaId(org.id);
    setQuotaDraft(String(org.apiMonthlyQuota));
  };

  const saveQuota = async (org: ApiClientOrg) => {
    const parsed = Number(quotaDraft);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Quota must be a positive number");
      return;
    }
    setSavingQuotaId(org.id);
    try {
      await setOrgQuota(org.id, parsed);
      setOrgs((prev) => prev.map((o) => (o.id === org.id ? { ...o, apiMonthlyQuota: parsed } : o)));
      toast.success(`Monthly quota for "${org.name}" set to ${parsed}`);
      setEditingQuotaId(null);
    } catch (e: unknown) {
      toast.error("Failed to update quota: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSavingQuotaId(null);
    }
  };

  const handleCreateOrg = async () => {
    if (!newOrgName.trim() || !newOrgEmail.trim()) {
      toast.error("Client name and contact email are required");
      return;
    }
    setCreatingOrg(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not authenticated");
      await createApiOnlyOrg({
        name: newOrgName.trim(),
        contactEmail: newOrgEmail.trim(),
        adminUid: auth.user.id,
      });
      toast.success(`"${newOrgName}" created — API access is enabled by default`);
      setNewOrgName("");
      setNewOrgEmail("");
      setShowNewOrgForm(false);
      fetchOrgs();
    } catch (e: unknown) {
      toast.error("Failed to create client: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCreatingOrg(false);
    }
  };

  const toggleAccess = async (org: ApiClientOrg) => {
    setTogglingId(org.id);
    try {
      await setOrgApiAccess(org.id, !org.apiAccessEnabled);
      setOrgs((prev) =>
        prev.map((o) => (o.id === org.id ? { ...o, apiAccessEnabled: !o.apiAccessEnabled } : o))
      );
      toast.success(`API access ${!org.apiAccessEnabled ? "enabled" : "disabled"} for "${org.name}"`);
    } catch (e: unknown) {
      toast.error("Failed to update access: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">API Clients</h2>
          <p className="text-sm text-muted-foreground">
            Standalone B2B API access — hospitals, chains, and developers who use the API only.
            They never log into the pharmacy app.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchOrgs} disabled={loading} className="gap-2">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowNewOrgForm((v) => !v)} className="gap-2">
            <Plus className="h-3.5 w-3.5" />
            New Client
          </Button>
        </div>
      </div>

      {showNewOrgForm && (
        <div className="rounded-xl border bg-card p-4 space-y-3">
          <h3 className="text-sm font-medium">New API Client</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">Client Name</Label>
              <Input
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                placeholder="e.g. Reddington Hospital"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Contact Email</Label>
              <Input
                type="email"
                value={newOrgEmail}
                onChange={(e) => setNewOrgEmail(e.target.value)}
                placeholder="dev@client.com"
                className="mt-1"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleCreateOrg} disabled={creatingOrg} className="gap-2">
              <Check className="h-3.5 w-3.5" />
              {creatingOrg ? "Creating…" : "Create Client"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNewOrgForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading API clients…</span>
        </div>
      ) : orgs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No API clients yet. Click "New Client" to provision one.
        </div>
      ) : (
        <div className="space-y-2">
          {orgs.map((org) => (
            <div key={org.id} className="rounded-xl border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{org.name}</span>
                    <Badge variant="outline" className="text-xs">{org.subscriptionTier}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{org.email || "No contact email"}</p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Access</Label>
                    <Switch
                      checked={org.apiAccessEnabled}
                      disabled={togglingId === org.id}
                      onCheckedChange={() => toggleAccess(org)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setExpandedOrgId(expandedOrgId === org.id ? null : org.id)}
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    Keys
                    {expandedOrgId === org.id ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between px-4 pb-3 -mt-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    Usage this month:{" "}
                    <span className={`font-medium ${
                      (usage[org.id] ?? 0) >= org.apiMonthlyQuota ? "text-red-400" : "text-foreground"
                    }`}>
                      {usage[org.id] ?? 0}
                    </span>
                    {" / "}
                    {editingQuotaId === org.id ? (
                      <span className="inline-flex items-center gap-1 align-middle">
                        <Input
                          type="number"
                          value={quotaDraft}
                          onChange={(e) => setQuotaDraft(e.target.value)}
                          className="h-6 w-20 text-xs px-1.5 py-0"
                          min={0}
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5"
                          disabled={savingQuotaId === org.id}
                          onClick={() => saveQuota(org)}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5"
                          onClick={() => setEditingQuotaId(null)}
                        >
                          ✕
                        </Button>
                      </span>
                    ) : (
                      <button
                        className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                        onClick={() => startEditQuota(org)}
                        title="Click to edit monthly quota"
                      >
                        {org.apiMonthlyQuota}/mo
                      </button>
                    )}
                  </span>
                </div>
              </div>
              {expandedOrgId === org.id && (
                <div className="border-t bg-muted/20 px-4 py-4">
                  <KeyManager org={org} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Key Manager ──────────────────────────────────────────────────────────────
// Inline panel (not a modal) shown under an expanded API client row.
// Handles listing, creating, revoking, and reactivating keys for one org.
function KeyManager({ org }: { org: ApiClientOrg }) {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewKeyForm, setShowNewKeyForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<ApiScope[]>([]);
  const [creating, setCreating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<{ raw: string; prefix: string } | null>(null);
  const [busyKeyId, setBusyKeyId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listApiKeys(org.id);
      setKeys(data);
    } catch (e: unknown) {
      toast.error("Failed to load keys: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, [org.id]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const toggleScope = (scope: ApiScope) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast.error("Key name is required (e.g. \"Production\", \"Staging\")");
      return;
    }
    if (selectedScopes.length === 0) {
      toast.error("Select at least one scope");
      return;
    }
    setCreating(true);
    try {
      const created = await createApiKey({
        orgId: org.id,
        name: newKeyName.trim(),
        scopes: selectedScopes,
      });
      setRevealedKey({ raw: created.rawKey, prefix: created.keyPrefix });
      setNewKeyName("");
      setSelectedScopes([]);
      setShowNewKeyForm(false);
      fetchKeys();
    } catch (e: unknown) {
      toast.error("Failed to create key: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (key: ApiKey) => {
    setBusyKeyId(key.id);
    try {
      await revokeApiKey(key.id);
      toast.success(`"${key.name}" revoked`);
      fetchKeys();
    } catch (e: unknown) {
      toast.error("Failed to revoke: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusyKeyId(null);
    }
  };

  const handleReactivate = async (key: ApiKey) => {
    setBusyKeyId(key.id);
    try {
      await reactivateApiKey(key.id);
      toast.success(`"${key.name}" reactivated`);
      fetchKeys();
    } catch (e: unknown) {
      toast.error("Failed to reactivate: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusyKeyId(null);
    }
  };

  const copyRevealedKey = () => {
    if (!revealedKey) return;
    navigator.clipboard.writeText(revealedKey.raw);
    toast.success("Key copied to clipboard");
  };

  return (
    <div className="space-y-3">
      {/* Revealed raw key — shown once, dismissible */}
      {revealedKey && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 space-y-2">
          <p className="text-xs text-emerald-300 font-medium">
            Copy this key now — it will not be shown again. Only the prefix ({revealedKey.prefix}…) is stored for display.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-background/60 rounded px-2 py-1.5 break-all">
              {revealedKey.raw}
            </code>
            <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={copyRevealedKey}>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setRevealedKey(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-muted-foreground">Keys for {org.name}</h4>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowNewKeyForm((v) => !v)}>
          <Plus className="h-3.5 w-3.5" />
          New Key
        </Button>
      </div>

      {showNewKeyForm && (
        <div className="rounded-lg border bg-background p-3 space-y-3">
          <div>
            <Label className="text-xs">Key Name</Label>
            <Input
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. Production"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Scopes</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {ALL_SCOPES.map((scope) => (
                <label
                  key={scope}
                  className="flex items-center gap-2 text-xs rounded border px-2 py-1.5 cursor-pointer hover:bg-muted/40"
                >
                  <input
                    type="checkbox"
                    checked={selectedScopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    className="accent-primary"
                  />
                  {scope}
                </label>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleCreateKey} disabled={creating} className="gap-2">
              <Check className="h-3.5 w-3.5" />
              {creating ? "Generating…" : "Generate Key"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNewKeyForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-6 justify-center text-sm">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Loading keys…
        </div>
      ) : keys.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">No keys yet for this client.</p>
      ) : (
        <div className="space-y-1.5">
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{key.name}</span>
                  <code className="text-muted-foreground">{key.keyPrefix}…</code>
                  {key.isActive ? (
                    <Badge className="text-xs bg-emerald-500/15 text-emerald-400 border-emerald-500/30 border">
                      active
                    </Badge>
                  ) : (
                    <Badge className="text-xs bg-red-500/15 text-red-400 border-red-500/30 border">
                      revoked
                    </Badge>
                  )}
                </div>
                <div className="text-muted-foreground mt-1 flex flex-wrap gap-1">
                  {key.scopes.map((s) => (
                    <span key={s} className="bg-muted rounded px-1.5 py-0.5">{s}</span>
                  ))}
                </div>
                <p className="text-muted-foreground mt-1">
                  Created {new Date(key.createdAt).toLocaleDateString()}
                  {key.lastUsedAt ? ` · Last used ${new Date(key.lastUsedAt).toLocaleDateString()}` : " · Never used"}
                </p>
              </div>
              <div className="shrink-0 ml-2">
                {key.isActive ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    disabled={busyKeyId === key.id}
                    onClick={() => handleRevoke(key)}
                  >
                    <Ban className="h-3.5 w-3.5" />
                    Revoke
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                    disabled={busyKeyId === key.id}
                    onClick={() => handleReactivate(key)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reactivate
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
