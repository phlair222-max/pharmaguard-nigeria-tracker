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

const ADMIN_EMAIL = "phlair222@gmail.com";

const ALL_ITEMS = [
  { title: "Dashboard",       url: "/",          icon: LayoutDashboard, planKey: null,                   cashierAllowed: true  },
  { title: "Inventory",       url: "/inventory", icon: Package,         planKey: null,                   cashierAllowed: true  },
  { title: "POS / Sales",     url: "/pos",       icon: ShoppingCart,    planKey: null,                   cashierAllowed: true  },
  { title: "Sales History",   url: "/sales",     icon: ReceiptText,     planKey: null,                   cashierAllowed: true  },
  { title: "Suppliers",       url: "/suppliers", icon: Truck,           planKey: "canSuppliers",         cashierAllowed: false },
  { title: "Reports",         url: "/reports",   icon: FileBarChart2,   planKey: "canReports",           cashierAllowed: false },
  { title: "AI Forecast",     url: "/forecast",  icon: Sparkles,        planKey: "canAiForecast",        cashierAllowed: false },
  // Poisons Register: legally required — Cashiers must access it when dispensing controlled drugs
  { title: "Poisons Register",url: "/poisons",   icon: ShieldAlert,     planKey: "canPoisonsRegister",   cashierAllowed: true  },
  { title: "Audit Trail",     url: "/audit",     icon: History,         planKey: "canAuditTrail",        cashierAllowed: false },
  { title: "Settings",        url: "/settings",  icon: SettingsIcon,    planKey: null,                   cashierAllowed: false },
] as const;

function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const settings = useStore((s) => s.settings);
  const user = useStore((s) => s.user);
  const isPlatformAdmin = user?.username?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const planGates = usePlan();

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
                const isCashier = user?.memberRole === "Cashier";
                // Plan gate check (same for all roles — plan belongs to the org, not the user)
                const planLocked = item.planKey ? !planGates[item.planKey as keyof typeof planGates] : false;
                // Cashier: hide items not meant for them entirely
                if (isCashier && !item.cashierAllowed) return null;
                // Cashier: if item is cashierAllowed but plan-locked, hide it (no lock icon — they can't upgrade)
                if (isCashier && item.cashierAllowed && planLocked) return null;
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
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header: fixed height, never grows, ticker is sandwiched between trigger and theme toggle */}
          <header className="sticky top-0 z-30 flex h-12 w-full items-center gap-2 border-b bg-card/80 px-3 backdrop-blur overflow-hidden">
            <SidebarTrigger className="shrink-0" />
            {/* Ticker occupies only the middle space — flex-1 with min-w-0 ensures it never overflows */}
            <div className="min-w-0 flex-1 overflow-hidden">
              <HeaderTicker />
            </div>
            <ThemeToggle />
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
