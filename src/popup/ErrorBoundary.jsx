import React, { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-[400px] min-h-[200px] bg-background text-foreground p-4 font-sans">
          <h2 className="text-destructive text-lg font-bold mb-2">Something went wrong</h2>
          <p className="text-sm text-muted mb-3">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 rounded-lg text-sm font-medium text-on-primary bg-primary hover:bg-secondary active:scale-95 transition-all duration-200"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
