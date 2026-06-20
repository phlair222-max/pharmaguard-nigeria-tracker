function AuthCallback() {
  const navigate = useNavigate();
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        store.setAuthUser({ id: data.session.user.id, email: data.session.user.email || "user" });
        const hasPassword = data.session.user.user_metadata?.has_password === true;
        if (!hasPassword) {
          setNeedsPassword(true);
        } else {
          void store.hydrateFromSupabase();
          navigate("/", { replace: true });
        }
      } else {
        navigate("/login", { replace: true });
      }
    });
  }, [navigate]);

  const savePassword = async () => {
    if (password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (password !== confirm) { toast.error("Passwords don't match"); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({
      password,
      data: { has_password: true },
    });
    if (error) {
      toast.error("Failed to set password: " + error.message);
      setSaving(false);
      return;
    }
    toast.success("Password set successfully — welcome to PharmaGuard NG!");
    void store.hydrateFromSupabase();
    navigate("/", { replace: true });
  };

  if (needsPassword) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="flex justify-center">
              <div className="rounded-xl bg-primary/10 p-3">
                <svg className="h-8 w-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
            </div>
            <h1 className="text-2xl font-bold">Set your password</h1>
            <p className="text-sm text-muted-foreground">Create a password to secure your PharmaGuard NG account</p>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat your password"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                onKeyDown={e => e.key === "Enter" && savePassword()}
              />
            </div>
            <button
              onClick={savePassword}
              disabled={saving}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Setting password…" : "Set password & continue →"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center flex-col gap-3">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  );
}
