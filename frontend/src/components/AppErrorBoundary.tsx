import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { hasError: boolean; message: string };

/**
 * Global error boundary — prevents blank white screens on render failures.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message ? String(error.message) : "Unexpected application error",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary]", error, info?.componentStack);
  }

  private handleReload = () => {
    window.location.assign("/");
  };

  private handleRetry = () => {
    this.setState({ hasError: false, message: "" });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
          <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            The page failed to render. You can retry or return to the home screen.
          </p>
          {this.state.message ? (
            <p className="max-w-lg break-words rounded-md border bg-muted/40 px-3 py-2 text-left text-xs text-muted-foreground">
              {this.state.message}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={this.handleRetry}>
              Try again
            </Button>
            <Button type="button" onClick={this.handleReload}>
              Go home
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
