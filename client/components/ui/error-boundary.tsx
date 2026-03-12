"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error?: Error; reset: () => void }>;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      const FallbackComponent = this.props.fallback || DefaultErrorFallback;
      return <FallbackComponent error={this.state.error} reset={this.reset} />;
    }

    return this.props.children;
  }
}

function DefaultErrorFallback({ error, reset }: { error?: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-xl">Something went wrong</CardTitle>
          <CardDescription>
            We encountered an unexpected error. Please try refreshing the page.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          {error && (
            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                Error details
              </summary>
              <pre className="mt-2 text-xs bg-muted p-3 rounded overflow-auto">
                {error.message}
                {error.stack && "\n\n" + error.stack}
              </pre>
            </details>
          )}
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button onClick={reset} className="flex-1">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard">
              <Home className="h-4 w-4 mr-2" />
              Dashboard
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// Network error fallback
export function NetworkErrorFallback({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="h-6 w-6 text-orange-500" />
          </div>
          <CardTitle className="text-xl">Connection Error</CardTitle>
          <CardDescription>
            Unable to connect to the server. Please check your internet connection.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={reset} className="w-full">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry Connection
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// 404 Not Found page
export function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
            <span className="text-2xl font-bold text-muted-foreground">404</span>
          </div>
          <CardTitle className="text-xl">Page Not Found</CardTitle>
          <CardDescription>
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild className="w-full">
            <Link href="/dashboard">
              <Home className="h-4 w-4 mr-2" />
              Go to Dashboard
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// Server error page
export function ServerErrorPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="h-6 w-6 text-red-500" />
          </div>
          <CardTitle className="text-xl">Server Error</CardTitle>
          <CardDescription>
            Something went wrong on our end. Please try again later.
          </CardDescription>
        </CardHeader>
        <CardFooter className="flex gap-2">
          <Button onClick={() => window.location.reload()} className="flex-1">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Page
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard">
              <Home className="h-4 w-4 mr-2" />
              Dashboard
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// Hook for handling async errors
export function useAsyncError() {
  const [error, setError] = React.useState<Error | null>(null);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  const captureError = React.useCallback((error: Error) => {
    setError(error);
  }, []);

  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  return { captureError, resetError };
}
