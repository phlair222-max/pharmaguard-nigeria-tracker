import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { LayoutDashboard, Package, ShoppingCart, FileBarChart2, ShieldAlert, History, LogOut, Pill, Moon, Sun, Truck, ReceiptText, Settings as SettingsIcon, Sparkles, ShieldCheck, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const settings = useStore((s) => s.settings);
  const user = useStore((s) => s.user);
  const isPlatformAdmin = user?.username?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const planGates = usePlan();
  const role = resolveEffectiveRole(user);

  const adminItem = { title: "Platform Admin", url: "/admin", icon: ShieldCheck };

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
  const navigate = useNavigate();
  if (!user) return null;
  return (
    <div className="flex items-center justify-between p-2">
      {!collapsed && (
        <div className="text-xs">
          <div className="font-medium text-sidebar-foreground">{user.username}</div>
          <div className="text-sidebar-foreground/60">{user.memberRole ?? user.role}</div>
        </div>
      )}
      <Button
        variant="ghost" size="icon"
        className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent"
        onClick={async () => {
          const { supabase } = await import("@/integrations/supabase/client");
          await supabase.auth.signOut();
          store.logout();
          navigate("/login");
        }}
      >
        <LogOut className="h-4 w-4" />
      </Button>
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
    // SidebarProvider renders its OWN wrapper div around everything inside
    // it, and that wrapper defaults to `min-h-screen` — not `h-screen`.
    // That default wrapper is the true outermost boundary of the app, sitting
    // above the div below. Overriding it here with `h-screen overflow-hidden`
    // is the actual fix: without this, the page had no real ceiling at the
    // very top of the tree, so everything nested inside (including
    // `main`'s overflow-auto and Inventory's own table scroll container)
    // never got a bounded height to work with, no matter what was set
    // further down.
    <SidebarProvider className="h-screen overflow-hidden">
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
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
