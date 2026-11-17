import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { LayoutDashboard, Package, ShoppingCart, FileBarChart2, ShieldAlert, History, LogOut, Pill, Moon, Sun, Truck, ReceiptText, Settings as SettingsIcon, Sparkles, ShieldCheck, Lock, Zap, CloudOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
// STEP 29: confirmation box when logging out with unsent records
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { store, useStore, usePlan } from "@/lib/store";
import { useTheme } from "next-themes";
import HeaderTicker from "./HeaderTicker";
import { canAccessPage, resolveEffectiveRole, type PageKey } from "@/lib/permissions";

const ADMIN_EMAIL = "phlair222@gmail.com";

const ALL_ITEMS = [
  // FIX (Session 8): this was "/" — which matches App.tsx's top-level public
  // Landing route, NOT the actual protected "/dashboard" route registered
  // inside SessionGate/AppLayout. Every click on this link was leaving the
  // SessionGate tree entirely (unmounting it), landing on Landing, then
  // presumably redirecting back into "/dashboard" — which remounts
  // SessionGate fresh and re-runs the full hydrateFromSupabase() every time,
  // regardless of the hydratedRef dedupe (a fresh mount has a fresh ref).
  { title: "Dashboard",       url: "/dashboard", icon: LayoutDashboard, planKey: null,                   page: "dashboard" as PageKey    },
  { title: "Inventory",       url: "/inventory", icon: Package,         planKey: null,                   page: "inventory" as PageKey    },
  { title: "POS / Sales",     url: "/pos",       icon: ShoppingCart,    planKey: null,                   page: "pos" as PageKey          },
  { title: "Sales History",   url: "/sales",     icon: ReceiptText,     planKey: null,                   page: "salesHistory" as PageKey },
  { title: "Suppliers",       url: "/suppliers", icon: Truck,           planKey: "canSuppliers",         page: "suppliers" as PageKey    },
  { title: "Reports",         url: "/reports",   icon: FileBarChart2,   planKey: "canReports",           page: "reports" as PageKey      },
  { title: "AI Forecast",     url: "/forecast",  icon: Sparkles,        planKey: "canAiForecast",        page: "forecast" as PageKey     },
  // Poisons Register: legally required — everyone with dispensing access needs this
  { title: "Poisons Register",url: "/poisons",   icon: ShieldAlert,     planKey: "canPoisonsRegister",   page: "poisons" as PageKey      },
  { title: "Audit Trail",     url: "/audit",     icon: History,         planKey: "canAuditTrail",        page: "audit" as PageKey        },
  { title: "Settings",        url: "/settings",  icon: SettingsIcon,    planKey: null,                   page: "settings" as PageKey     },
] as const;

function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const settings = useStore((s) => s.settings);
  const user = useStore((s) => s.user);
  const isPlatformAdmin = user?.username?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const planGates = usePlan();
  const role = resolveEffectiveRole(user);

  const adminItem = { title: "Platform Admin", url: "/admin", icon: ShieldCheck };

  // FIX (mobile nav bug): on mobile the sidebar renders as an overlay Sheet
  // (see ui/sidebar.tsx — `isMobile ? <Sheet open={openMobile} ...>`).
  // Clicking a NavLink navigates the underlying route just fine, but nothing
  // was ever telling the Sheet to close, so the overlay stayed open on top
  // of the new page until the user manually collapsed it themselves. This
  // closes the mobile drawer the instant a nav item is tapped.
  const closeMobileNav = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <img
            src={settings.logo || "/logo.jpg"}
            alt="logo"
            className="h-9 w-9 rounded-lg object-cover border bg-white shadow-elevated"
          />
          {!collapsed && (
            <div className="leading-tight min-w-0">
              <div className="font-semibold text-sidebar-foreground truncate">{settings.name || "PharmaGuard NG"}</div>
              <div className="text-[11px] text-sidebar-foreground/70">Nigeria Pharma Tracker</div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ALL_ITEMS.map((item) => {
                // Role gate — single source of truth in permissions.ts
                if (!canAccessPage(role, item.page)) return null;
                // Plan gate check (same for all roles — plan belongs to the org, not the user)
                const planLocked = item.planKey ? !planGates[item.planKey as keyof typeof planGates] : false;
                // Non-Owner roles can't upgrade the plan themselves — hide
                // plan-locked items entirely for them instead of showing a
                // lock icon they can't do anything about.
                if (role !== "Owner" && planLocked) return null;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      {planLocked ? (
                        <div
                          className="flex items-center gap-2 opacity-40 cursor-not-allowed select-none"
                          title="Upgrade your plan to unlock this feature"
                        >
                          <item.icon className="h-4 w-4" />
                          {!collapsed && <span className="flex-1">{item.title}</span>}
                          {!collapsed && <Lock className="h-3 w-3 ml-auto" />}
                        </div>
                      ) : (
                        <NavLink
                          to={item.url}
                          end={item.url === "/"}
                          onClick={closeMobileNav}
                          className={({ isActive }) =>
                            `flex items-center gap-2 ${isActive ? "bg-sidebar-accent text-sidebar-primary font-medium" : ""}`
                          }
                        >
                          <item.icon className="h-4 w-4" />
                          {!collapsed && <span>{item.title}</span>}
                        </NavLink>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
              {isPlatformAdmin && (
                <SidebarMenuItem key="admin">
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={adminItem.url}
                      onClick={closeMobileNav}
                      className={({ isActive }) =>
                        `flex items-center gap-2 ${isActive ? "bg-sidebar-accent text-sidebar-primary font-medium" : ""}`
                      }
                    >
                      <adminItem.icon className="h-4 w-4 text-violet-400" />
                      {!collapsed && <span className="text-violet-400">{adminItem.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <UserBadge collapsed={collapsed} />
      </SidebarFooter>
    </Sidebar>
  );
}

function UserBadge({ collapsed }: { collapsed: boolean }) {
  const user = useStore((s) => s.user);
  const plan = usePlan();
  const navigate = useNavigate();
  // STEP 29: logout never deletes unsent sales / Poisons Register entries.
  const [busy, setBusy] = useState(false);
  const [unsent, setUnsent] = useState<{ sales: number; dispenses: number } | null>(null);
  if (!user) return null;

  const finishLogout = async (keptCount: number) => {
    setBusy(true);
    try {
      // Recorded while still signed in (it used to be sent after signing out,
      // so the server never received it).
      await store.recordLogoutAudit(
        keptCount > 0 ? `${keptCount} unsent record${keptCount !== 1 ? "s" : ""} kept on this device` : undefined
      );
      // Put the unsent records somewhere safe BEFORE signing out.
      if (!store.parkUnsentNow()) {
        toast.error("The unsent records could not be stored safely on this device, so you are still signed in. Connect to the internet and try again.", { duration: 10000 });
        return;
      }
      const { offline } = await store.signOutThisDevice(); // this device only
      store.logout();
      if (keptCount > 0) {
        toast.info(`Logged out. ${keptCount} unsent record${keptCount !== 1 ? "s are" : " is"} kept on this device and will upload when you sign in here again.`, { duration: 10000 });
      } else if (offline) {
        toast.info("Logged out on this device (no connection).");
      }
      navigate("/login");
    } finally {
      setBusy(false);
      setUnsent(null);
    }
  };

  const onLogoutClick = async () => {
    if (busy) return;
    setBusy(true);
    let left = store.unsentCount();
    try {
      if (left.sales + left.dispenses > 0 && navigator.onLine) {
        toast.info("Uploading unsent records before logging out…");
        left = await store.syncAllPending();
      }
    } finally {
      setBusy(false);
    }
    if (left.sales + left.dispenses > 0) {
      setUnsent(left); // ask first
      return;
    }
    await finishLogout(0);
  };

  // FIX: upgrade entry point placed at the sidebar footer, right next to
  // the signed-in user's email — only shown to the Owner (non-Owner roles
  // can't change billing) and only when there's actually somewhere to
  // upgrade to (hidden once already on Pro). Deep-links straight into the
  // new Plan & Billing tab via ?tab=billing instead of dropping the Owner
  // on the generic Details tab.
  const isOwner = user.memberRole === "Owner" || (!user.memberRole && user.role === "Admin");
  const canUpgrade = isOwner && plan.tier !== "pro";

  return (
    <div className="flex flex-col gap-1.5 p-2">
      <div className="flex items-center justify-between">
        {!collapsed && (
          <div className="text-xs min-w-0">
            <div className="font-medium text-sidebar-foreground truncate">{user.username}</div>
            <div className="text-sidebar-foreground/60">{user.memberRole ?? user.role}</div>
          </div>
        )}
        <Button
          variant="ghost" size="icon"
          className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent shrink-0"
          title="Log out"
          disabled={busy}
          onClick={() => { void onLogoutClick(); }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
        </Button>
      </div>
      {!collapsed && canUpgrade && (
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5 h-7 text-xs border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
          onClick={() => navigate("/settings?tab=billing")}
        >
          <Zap className="h-3 w-3" />
          {plan.tier === "free" ? "Upgrade plan" : "Upgrade to Pro"}
        </Button>
      )}

      {/* STEP 29: unsent records — never deleted; the person chooses to stay or to log out and keep them */}
      <AlertDialog open={!!unsent} onOpenChange={(o) => { if (!o) setUnsent(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CloudOff className="h-5 w-5 text-amber-500" /> Unsent records on this device
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  {unsent && unsent.sales > 0 && <><strong>{unsent.sales} sale{unsent.sales !== 1 ? "s" : ""}</strong></>}
                  {unsent && unsent.sales > 0 && unsent.dispenses > 0 && " and "}
                  {unsent && unsent.dispenses > 0 && <><strong>{unsent.dispenses} Poisons Register entr{unsent.dispenses !== 1 ? "ies" : "y"}</strong></>}
                  {" "}have not reached the server yet (no connection, or the server refused them).
                </p>
                <p>
                  If you log out, they stay safely on this device and upload automatically the next time
                  {" "}<strong>{user.username}</strong> signs in here. Do not clear this browser&apos;s data until then.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay signed in</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { const n = (unsent?.sales ?? 0) + (unsent?.dispenses ?? 0); void finishLogout(n); }}
            >
              Log out and keep them
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// STEP 29: this device holds unsent records that belong to ANOTHER account.
// They are not shown or uploaded here; they upload when that person signs in.
function HeldRecordsNotice() {
  const held = useStore((s) => s.heldForOthers);
  if (!held || held.count === 0) return null;
  return (
    <div role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
      <CloudOff className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        This device holds <strong>{held.count} unsent record{held.count !== 1 ? "s" : ""}</strong> (sales / Poisons Register)
        recorded by <strong>{held.names.join(", ")}</strong>. They will upload automatically when that person signs in on
        this device. Do not clear this browser&apos;s data until then.
      </span>
    </div>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      <Sun className="h-4 w-4 dark:hidden" />
      <Moon className="hidden h-4 w-4 dark:block" />
    </Button>
  );
}

export default function AppLayout() {
  return (
    // FIX (mobile display bug): h-screen resolves to 100vh, which on mobile
    // browsers is the LARGEST possible viewport height — it does not shrink
    // when the browser's address bar / toolbar is visible. That mismatch
    // between the CSS height and the real visible viewport is what was
    // cutting off / squishing Inventory, POS, and other pages on phones.
    // h-dvh uses the dynamic viewport unit, which tracks the actual visible
    // area as mobile browser chrome shows/hides.
    <SidebarProvider className="h-dvh overflow-hidden">
      <div className="flex h-full w-full overflow-hidden bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Header: fixed height, never grows, ticker is sandwiched between trigger and theme toggle */}
          <header className="sticky top-0 z-30 flex h-12 w-full shrink-0 items-center gap-2 border-b bg-card/80 px-3 backdrop-blur overflow-hidden">
            <SidebarTrigger className="shrink-0" />
            {/* Ticker occupies only the middle space — flex-1 with min-w-0 ensures it never overflows */}
            <div className="min-w-0 flex-1 overflow-hidden">
              <HeaderTicker />
            </div>
            <ThemeToggle />
          </header>
          {/* min-h-0 added: flex-1 alone does NOT cap a flex child's height —
              a flex item's default min-height is `auto`, so without min-h-0
              this element was still free to grow past the space the flex
              column gave it in order to fit whatever page content (like
              Inventory's table) was rendered inside it. That meant
              Inventory.tsx's own `h-full` wrapper had no real bounded parent
              to measure against, so it fell back to content-based height —
              same root-cause pattern as the two earlier fixes, one level
              deeper in the tree. */}
          <main className="flex-1 min-h-0 overflow-auto p-4 md:p-6">
            <HeldRecordsNotice /> {/* STEP 29 */}
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
