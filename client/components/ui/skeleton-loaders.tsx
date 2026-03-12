import { Skeleton } from "@/components/ui/skeleton";

export function StatCardSkeleton() {
  return (
    <div className="bg-card rounded-lg border p-6 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function AlertRowSkeleton() {
  return (
    <div className="flex items-center gap-3 p-4 border-b">
      <Skeleton className="h-3 w-3 rounded-full" />
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-64" />
      </div>
      <Skeleton className="h-6 w-16 rounded-full" />
      <Skeleton className="h-8 w-8" />
    </div>
  );
}

export function DeviceRowSkeleton() {
  return (
    <div className="flex items-center gap-3 p-4 border-b">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-48" />
      </div>
      <Skeleton className="h-6 w-20 rounded-full" />
      <Skeleton className="h-8 w-8" />
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="bg-card rounded-lg border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-24" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function MetricCardSkeleton() {
  return (
    <div className="bg-card rounded-lg border p-4 space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-6 w-16" />
      <div className="space-y-2">
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-2 w-3/4" />
      </div>
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-card rounded-lg border">
      <div className="border-b p-4">
        <Skeleton className="h-5 w-32" />
      </div>
      <div className="divide-border">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-4 border-b">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SidebarSkeleton() {
  return (
    <div className="w-60 h-full bg-card border-r p-4 space-y-6">
      <Skeleton className="h-8 w-32" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}

export function TopBarSkeleton() {
  return (
    <div className="h-16 border-b flex items-center justify-between px-6">
      <Skeleton className="h-8 w-48" />
      <div className="flex items-center gap-4">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-8 w-10 rounded-full" />
      </div>
    </div>
  );
}
