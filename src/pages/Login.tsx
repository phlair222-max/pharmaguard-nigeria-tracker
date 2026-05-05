import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Pill } from "lucide-react";
import { store, useStore } from "@/lib/store";
import { useNavigate, Navigate } from "react-router-dom";
import { toast } from "sonner";

export default function Login() {
  const user = useStore((s) => s.user);
  const navigate = useNavigate();
  const [u, setU] = useState("admin");
  const [p, setP] = useState("admin");
  if (user) return <Navigate to="/" replace />;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (store.login(u, p)) {
      toast.success(`Welcome back, ${u}`);
      navigate("/");
    } else {
      toast.error("Invalid credentials");
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center gradient-subtle p-4">
      <Card className="w-full max-w-md shadow-elevated">
        <CardHeader className="items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary text-primary-foreground shadow-elevated">
            <Pill className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl">PharmaGuard NG</CardTitle>
          <CardDescription>Nigeria Pharma Tracker — sign in to continue</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="u">Username</Label>
              <Input id="u" value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p">Password</Label>
              <Input id="p" type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full">Sign In</Button>
            <div className="rounded-md border bg-muted/50 p-3 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">Demo accounts</div>
              <div>Admin — <code>admin</code> / <code>admin</code></div>
              <div>Pharmacist — <code>pharma</code> / <code>pharma</code></div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
