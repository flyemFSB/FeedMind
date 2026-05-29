"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex min-h-screen items-center justify-center bg-white p-8">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
              <AlertTriangle size={28} className="text-red-400" />
            </div>
            <h2 className="mb-2 text-[17px] font-semibold text-[#1d1d1f]">
              页面出现异常
            </h2>
            <p className="mb-6 text-[13px] text-[#86868b]">
              {this.state.error?.message || "发生了意外错误，请尝试刷新页面。"}
            </p>
            <Button
              onClick={this.handleRetry}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0071e3] px-5 py-2.5 text-[13px] font-medium text-white hover:bg-[#0066cc]"
            >
              <RefreshCw size={14} />
              重试
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
