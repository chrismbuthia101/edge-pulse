import { Suspense } from "react";
import {
  StatCardSkeleton,
  AlertRowSkeleton,
  DeviceRowSkeleton,
  ChartSkeleton,
  MetricCardSkeleton,
  TableSkeleton
} from "@/components/ui/skeleton-loaders";

export function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>

      {/* Recent Alerts */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Recent Alerts</h2>
            <p className="text-sm text-muted-foreground">Loading security events...</p>
          </div>
        </div>
        <div className="bg-card rounded-lg border">
          {Array.from({ length: 5 }).map((_, i) => (
            <AlertRowSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function AlertsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Security Alerts</h1>
          <p className="text-muted-foreground">Loading alerts...</p>
        </div>
      </div>

      <div className="bg-card rounded-lg border">
        {Array.from({ length: 10 }).map((_, i) => (
          <AlertRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function DevicesLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Connected Devices</h1>
          <p className="text-muted-foreground">Loading devices...</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
        <MetricCardSkeleton />
      </div>

      <div className="bg-card rounded-lg border">
        {Array.from({ length: 8 }).map((_, i) => (
          <DeviceRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function LiveLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Live Feed</h1>
          <p className="text-muted-foreground">Connecting to real-time stream...</p>
        </div>
      </div>

      <div className="bg-card rounded-lg border">
        {Array.from({ length: 15 }).map((_, i) => (
          <AlertRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function InsightsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">ML Insights</h1>
          <p className="text-muted-foreground">Analyzing patterns...</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>

      <TableSkeleton rows={8} />
    </div>
  );
}

export function SettingsLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground">Loading settings...</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card rounded-lg border p-6 space-y-4">
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                      <div className="h-3 w-48 bg-muted rounded animate-pulse" />
                    </div>
                    <div className="h-6 w-12 bg-muted rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-card rounded-lg border p-6 space-y-4">
            <div className="h-5 w-24 bg-muted rounded animate-pulse" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-4 w-full bg-muted rounded animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function NotificationsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Notifications</h1>
          <p className="text-muted-foreground">Loading notifications...</p>
        </div>
      </div>

      <div className="bg-card rounded-lg border">
        {Array.from({ length: 12 }).map((_, i) => (
          <AlertRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// Wrap components with Suspense for loading states
export function withLoading<P extends object>(
  Component: React.ComponentType<P>,
  LoadingComponent: React.ComponentType
) {
  return function WrappedComponent(props: P) {
    return (
      <Suspense fallback={<LoadingComponent />}>
        <Component {...props} />
      </Suspense>
    );
  };
}
