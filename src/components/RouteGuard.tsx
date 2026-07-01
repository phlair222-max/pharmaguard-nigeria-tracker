// src/components/RouteGuard.tsx
// Wraps a route element. Blocks it for real — unlike the sidebar, which
// only hides the link, this stops direct URL navigation too.

import { useStore } from "@/lib/store";
import { canAccessPage, resolveEffectiveRole, type PageKey } from "@/lib/permissions";
import { ShieldCheck } from "lucide-react";

export default function RouteGuard({ page, children }: { page: PageKey; children: JSX.Element }) {
  const user = useStore((s) => s.user);
  const role = resolveEffectiveRole(user);

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
