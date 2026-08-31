import { Component, type ErrorInfo, type ReactNode } from 'react';
import * as Sentry from '@sentry/react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Last-resort catch for render-time crashes. Sits above the router, so the
 * fallback uses plain anchors (window.location) rather than react-router
 * navigation — the router itself may be what crashed.
 *
 * Errors are always logged to the console; they are also forwarded to Sentry
 * when VITE_SENTRY_DSN was set at build time (init happens in main.tsx).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught render error:', error, info.componentStack);
    if (import.meta.env.VITE_SENTRY_DSN) {
      Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
    }
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        className="flex min-h-screen items-center justify-center px-6"
        style={{ background: 'var(--paper)' }}
      >
        <div className="w-full max-w-[440px] text-center">
          <p
            className="text-[13px] font-medium uppercase"
            style={{ color: 'var(--ember-deep)', letterSpacing: '0.22em', fontFamily: 'var(--font-mono)' }}
          >
            Something broke
          </p>
          <h1
            className="mt-3 text-[26px] font-semibold leading-tight"
            style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
          >
            This page hit an error
          </h1>
          <p className="mt-3 text-[14.5px] leading-[1.6]" style={{ color: 'var(--ink-mid)' }}>
            Your meetings and data are safe. Reloading usually clears it — if it
            keeps happening, write to hello@echobrief.in.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center justify-center rounded-md px-5 py-2.5 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--ember)' }}
            >
              Reload
            </button>
            <a
              href="/dashboard"
              className="inline-flex items-center justify-center rounded-md px-5 py-2.5 text-[14px] font-medium no-underline transition-colors"
              style={{
                border: '1px solid var(--rule)',
                background: 'var(--paper-card)',
                color: 'var(--ink)',
              }}
            >
              Go to dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }
}
