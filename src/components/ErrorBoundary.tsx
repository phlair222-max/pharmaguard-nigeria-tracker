import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Log locally but do not rethrow — keeps the app stable.
    // eslint-disable-next-line no-console
    console.warn("[ErrorBoundary]", error.message, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <AlertTriangle className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="mb-1 text-lg font-semibold">Something went wrong</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            The page hit an unexpected issue. You can retry or return to the dashboard.
          </p>
          <div className="flex justify-center gap-2">
            <Button variant="outline" onClick={this.reset}>Retry</Button>
            <Button onClick={() => { this.reset(); window.location.assign("/"); }}>Go to Dashboard</Button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
