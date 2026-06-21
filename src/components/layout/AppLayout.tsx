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

// Default pharmacy logo shown for every organization until the owner uploads
// their own in Settings → Branding & Logo. Embedded as a data URI so no
// extra asset file/hosting is needed.
const DEFAULT_LOGO = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEBLAEsAAD/4QBWRXhpZgAATU0AKgAAAAgABAEaAAUAAAABAAAAPgEbAAUAAAABAAAARgEoAAMAAAABAAIAAAITAAMAAAABAAEAAAAAAAAAAAEsAAAAAQAAASwAAAAB/+0ALFBob3Rvc2hvcCAzLjAAOEJJTQQEAAAAAAAPHAFaAAMbJUccAQAAAgAEAP/hDW5odHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvADw/eHBhY2tldCBiZWdpbj0n77u/JyBpZD0nVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkJz8+Cjx4OnhtcG1ldGEgeG1sbnM6eD0nYWRvYmU6bnM6bWV0YS8nIHg6eG1wdGs9J0ltYWdlOjpFeGlmVG9vbCAxMS44OCc+CjxyZGY6UkRGIHhtbG5zOnJkZj0naHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyc+CgogPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9JycKICB4bWxuczp0aWZmPSdodHRwOi8vbnMuYWRvYmUuY29tL3RpZmYvMS4wLyc+CiAgPHRpZmY6UmVzb2x1dGlvblVuaXQ+MjwvdGlmZjpSZXNvbHV0aW9uVW5pdD4KICA8dGlmZjpYUmVzb2x1dGlvbj4zMDAvMTwvdGlmZjpYUmVzb2x1dGlvbj4KICA8dGlmZjpZUmVzb2x1dGlvbj4zMDAvMTwvdGlmZjpZUmVzb2x1dGlvbj4KIDwvcmRmOkRlc2NyaXB0aW9uPgoKIDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PScnCiAgeG1sbnM6eG1wPSdodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvJz4KICA8eG1wOkNyZWF0b3JUb29sPkFkb2JlIFN0b2NrIFBsYXRmb3JtPC94bXA6Q3JlYXRvclRvb2w+CiA8L3JkZjpEZXNjcmlwdGlvbj4KCiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0nJwogIHhtbG5zOnhtcE1NPSdodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvbW0vJz4KICA8eG1wTU06RG9jdW1lbnRJRD54bXAuaWlkOmM0NGRjMGJiLWI5ZTktNDU5MS04NTMzLWUxY2RkNGUwZTVjMzwveG1wTU06RG9jdW1lbnRJRD4KICA8eG1wTU06SW5zdGFuY2VJRD5hZG9iZTpkb2NpZDpzdG9jazo0NTc3MDgwNi1iZDJlLTQ3ZWItODZhNy1mYTM2NWM2OWU5ZDI8L3htcE1NOkluc3RhbmNlSUQ+CiAgPHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD5hZG9iZTpkb2NpZDpzdG9jazo2MDc4NTE1NjU8L3htcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD4KIDwvcmRmOkRlc2NyaXB0aW9uPgo8L3JkZjpSREY+CjwveDp4bXBtZXRhPgogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAogICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgCiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAKICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIAo8P3hwYWNrZXQgZW5kPSd3Jz8+/9sAQwAF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";

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
          <img
            src={settings.logo || DEFAULT_LOGO}
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
