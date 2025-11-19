import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Character Validation Error:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 cinematic-gradient relative overflow-hidden">
          {/* Large Background Text */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
            <h1 className="text-[20vw] md:text-[18vw] font-light text-white/10 tracking-tighter select-none whitespace-nowrap leading-none">
              Error
            </h1>
          </div>

          <div className="relative z-10 w-full max-w-2xl mx-auto">
            <div className="rounded-3xl border border-red-500/20 bg-red-500/5 backdrop-blur-xl shadow-2xl p-8 space-y-6 text-center">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
                <AlertTriangle className="w-8 h-8 text-red-400" />
              </div>

              <div className="space-y-4">
                <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
                <p className="text-white/60">
                  An unexpected error occurred during character validation. Please try again.
                </p>

                {this.state.error && (
                  <details className="text-left">
                    <summary className="text-sm text-red-400 cursor-pointer hover:text-red-300">
                      Error details
                    </summary>
                    <pre className="mt-2 text-xs text-red-300 bg-black/20 p-3 rounded overflow-auto">
                      {this.state.error.message}
                    </pre>
                  </details>
                )}
              </div>

              <button
                onClick={this.handleRetry}
                className="px-6 py-3 rounded-full bg-red-500 text-white text-base font-semibold hover:bg-red-600 transition-colors flex items-center gap-2 mx-auto"
              >
                <RefreshCw className="w-5 h-5" />
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}




