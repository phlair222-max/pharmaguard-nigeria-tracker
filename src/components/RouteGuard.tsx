// src/components/RouteGuard.tsx
// Wraps a route element. Blocks it for real — unlike the sidebar, which
// only hides the link, this stops direct URL navigation too.
import { useStore } from "@/lib/store";
import { canAccessPage, resolveEffectiveRole, type PageKey } from "@/lib/permissions";
import { ShieldCheck, Loader2 } from "lucide-react";

export default function RouteGuard({ page, children }: { page: PageKey; children: JSX.Element }) {
  const user = useStore((s) => s.user);
  const authReady = useStore((s) => s.authReady);
  const role = resolveEffectiveRole(user);

  // FIX: while the real role is still being confirmed (e.g. right after
  // login, or on a slow/patchy connection before store.ts can bridge in a
  // cached role or hydrateFromSupabase() can confirm one), show a neutral
  // loading state instead of either granting early access or flashing
  // "Access denied" at someone who may well turn out to be authorized a
  // moment later. authReady is set by store.ts once there's a role worth
  // trusting — either freshly confirmed or safely bridged from a returning
  // session — see setAuthUser() and hydrateFromSupabase() in store.ts.
  if (!authReady) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin opacity-50" />
        <p className="text-sm">Checking access…</p>
      </div>
    );
  }

  if (!canAccessPage(role, page)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <ShieldCheck className="h-12 w-12 opacity-30" />
        <p className="text-lg font-medium">Access denied</p>
        <p className="text-sm">
          Your role doesn't have access to this page. Contact your pharmacy Owner if you believe this is a mistake.
        </p>
      </div>
    );
  }
  return children;
}
