import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

function ErrorFallbackContent({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-editorial-canvas p-8">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-destructive/10">
          <AlertTriangle size={28} className="text-destructive" />
        </div>
        <h2 className="mb-2 text-base font-semibold text-editorial-ink">{t("error.title")}</h2>
        <p className="mb-6 text-body text-editorial-ink-soft">
          {error?.message ?? t("error.defaultMessage")}
        </p>
        <Button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium"
        >
          <RefreshCw size={14} />
          {t("common.retry")}
        </Button>
      </div>
    </div>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return <ErrorFallbackContent error={this.state.error} onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}
