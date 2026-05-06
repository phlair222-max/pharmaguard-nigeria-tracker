export const NGN = (n: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(n || 0);

export const num = (n: number) => new Intl.NumberFormat("en-NG").format(n || 0);

/** 4-tier (legacy): expired | critical (<30d) | warning (30-90d) | safe */
export function expiryStatus(dateStr: string): "expired" | "critical" | "warning" | "safe" {
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  if (days < 0) return "expired";
  if (days <= 30) return "critical";
  if (days <= 90) return "warning";
  return "safe";
}

/** 3-tier per spec: red (<=30d or expired) | yellow (1-6 months) | green (>6 months) */
export function expiryTier(dateStr: string): "red" | "yellow" | "green" {
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
  if (days <= 30) return "red";
  if (days <= 180) return "yellow";
  return "green";
}

export function expiryTierLabel(t: "red" | "yellow" | "green") {
  return t === "red" ? "Expired / <1 month" : t === "yellow" ? "1-6 months left" : "Safe (>6 months)";
}

export function expiryBadgeClass(t: "red" | "yellow" | "green") {
  return t === "red"
    ? "border-destructive bg-destructive/10 text-destructive"
    : t === "yellow"
    ? "border-warning bg-warning/10 text-warning"
    : "border-success bg-success/10 text-success";
}

export function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export function movementBadgeClass(m: "Fast" | "Medium" | "Slow") {
  return m === "Fast"
    ? "border-success bg-success/10 text-success"
    : m === "Medium"
    ? "border-info bg-info/10 text-info"
    : "border-muted-foreground/40 bg-muted text-muted-foreground";
}
