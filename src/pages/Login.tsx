import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { store, useStore } from "@/lib/store";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pharmacyName, setPharmacyName] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [signingUp, setSigningUp] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const settings = useStore((s) => s.settings);

  useEffect(() => {
    if (window.location.hash.includes("error")) {
      window.history.replaceState(null, "", window.location.pathname);
      setGoogleBusy(false);
      toast.error("Google sign-in failed. Please try again.");
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/", { replace: true });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        navigate("/", { replace: true });
      }
      if (event === "SIGNED_OUT") {
        setGoogleBusy(false);
        setSigningIn(false);
        setSigningUp(false);
      }
    });

    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    const handleFocus = () => {
      setTimeout(() => setGoogleBusy(false), 1000);
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigningIn(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setSigningIn(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Welcome back");
    navigate("/", { replace: true });
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSigningUp(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { pharmacy_name: pharmacyName },
      },
    });
    setSigningUp(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Account created — check your email to confirm");
  };

  const google = async () => {
    window.history.replaceState(null, "", window.location.pathname);
    setGoogleBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: "https://pharmaguardng.netlify.app",
      },
    });
    if (error) {
      setGoogleBusy(false);
      toast.error("Google sign-in failed");
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center gradient-subtle p-4">

      {/* Top left — owner photo */}
      <div className="absolute top-4 left-4">
        {settings.ownerPhoto ? (
          <img
            src={settings.ownerPhoto}
            alt="Owner"
            className="h-12 w-12 rounded-full object-cover border-2 border-white shadow-md"
          />
        ) : (
          <div className="h-12 w-12 rounded-full bg-muted border-2 border-white shadow-md flex items-center justify-center text-xs text-muted-foreground">
            You
          </div>
        )}
      </div>

      {/* Top right — pharmacy logo */}
      <div className="absolute top-4 right-4">
        {settings.logo ? (
          <img
            src={settings.logo}
            alt="Logo"
            className="h-12 w-12 rounded-xl object-cover border bg-white shadow-md"
          />
        ) : (
          <div className="h-12 w-12 rounded-xl bg-[#16a36e] flex items-center justify-center shadow-md">
            <svg viewBox="0 0 100 100" className="h-7 w-7">
              <rect x="38" y="15" width="24" height="70" rx="6" fill="white"/>
              <rect x="15" y="38" width="70" height="24" rx="6" fill="white"/>
            </svg>
          </div>
        )}
      </div>

      {/* Login Card */}
      <Card className="w-full max-w-md shadow-elevated">
        <CardHeader className="items-center text-center pb-2">
          <CardTitle className="text-2xl">PharmaGuard NG</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Create Account</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form className="space-y-4 pt-4" onSubmit={signIn}>
                <div className="space-y-2">
                  <Label htmlFor="e1">Email</Label>
                  <Input id="e1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p1">Password</Label>
                  <Input id="p1" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                </div>
                <Button type="submit" className="w-full" disabled={signingIn || googleBusy}>
                  {signingIn && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form className="space-y-4 pt-4" onSubmit={signUp}>
                <div className="space-y-2">
                  <Label htmlFor="ph">Pharmacy Name</Label>
                  <Input id="ph" required value={pharmacyName} onChange={(e) => setPharmacyName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="e2">Email</Label>
                  <Input id="e2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="p2">Password</Label>
                  <Input id="p2" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                </div>
                <Button type="submit" className="w-full" disabled={signingUp || googleBusy}>
                  {signingUp && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Account
                </Button>
              </form>
            </TabsContent>
          </Tabs>
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">OR</span></div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={google}
            disabled={googleBusy || signingIn || signingUp}
          >
            {googleBusy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <svg className="mr-2 h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.6l6.2 5.2C41.3 35.5 44 30.2 44 24c0-1.3-.1-2.3-.4-3.5z"/>
              </svg>
            )}
            Continue with Google
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
