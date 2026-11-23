import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#080B12] text-[#F8F7F2] flex items-center justify-center px-6">
          <div className="max-w-md w-full border border-white/10 bg-[#0E1420] rounded-xl p-8 text-center">
            <h1 className="font-display text-3xl font-semibold text-[#D6B36A] mb-3">
              Something went wrong
            </h1>
            <p className="text-sm text-[#CBD5E1] mb-6 leading-relaxed">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-[#D72638] hover:bg-[#b81d2d] text-[#F8F7F2] text-sm font-semibold rounded-lg transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
