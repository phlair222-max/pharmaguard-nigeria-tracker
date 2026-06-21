import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { LayoutDashboard, Package, ShoppingCart, FileBarChart2, ShieldAlert, History, LogOut, Pill, Moon, Sun, Truck, ReceiptText, Settings as SettingsIcon, Sparkles, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { store, useStore } from "@/lib/store";
import { useTheme } from "next-themes";
import HeaderTicker from "./HeaderTicker";

const ADMIN_EMAIL = "phlair222@gmail.com";

type MemberRole = "Owner" | "Pharmacist" | "Cashier";

// Each nav item declares which roles can see it. Omitting `roles` means
// everyone (Owner, Pharmacist, Cashier) can see it — matches the access
// table enforced server-side by RoleRoute in App.tsx.
const items: Array<{ title: string; url: string; icon: typeof LayoutDashboard; roles?: MemberRole[] }> = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Inventory", url: "/inventory", icon: Package },
  { title: "POS / Sales", url: "/pos", icon: ShoppingCart },
  { title: "Sales History", url: "/sales", icon: ReceiptText },
  { title: "Suppliers", url: "/suppliers", icon: Truck, roles: ["Owner", "Pharmacist"] },
  { title: "Reports", url: "/reports", icon: FileBarChart2, roles: ["Owner", "Pharmacist"] },
  { title: "AI Forecast", url: "/forecast", icon: Sparkles, roles: ["Owner"] },
  { title: "Poisons Register", url: "/poisons", icon: ShieldAlert },
  { title: "Audit Trail", url: "/audit", icon: History },
  { title: "Settings", url: "/settings", icon: SettingsIcon },
];

function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const settings = useStore((s) => s.settings);
  const user = useStore((s) => s.user);
  const isPlatformAdmin = user?.username?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  // Owner always sees everything. For Pharmacist/Cashier, filter by the
  // item's `roles` list. While memberRole hasn't resolved yet (hydration in
  // flight), show only the universally-visible items to avoid a flash of
  // restricted links.
  const memberRole = user?.memberRole;
  const visibleItems = items.filter((item) => {
    if (!item.roles) return true;
    if (!memberRole) return false;
    return memberRole === "Owner" || item.roles.includes(memberRole);
  });

  const adminItem = { title: "Platform Admin", url: "/admin", icon: ShieldCheck };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          {settings.logo ? (
            <img src={settings.logo} alt="logo" className="h-9 w-9 rounded-lg object-cover border bg-white shadow-elevated" />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-elevated">
              <Pill className="h-5 w-5" />
            </div>
          )}
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
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
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
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
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
          <div className="text-sidebar-foreground/60">{user.memberRole || user.role}</div>
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
          <header className="sticky top-0 z-30 flex h-12 w-full items-center gap-2 border-b bg-card/80 px-3 backdrop-blur overflow-hidden">
            <SidebarTrigger className="shrink-0" />
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
