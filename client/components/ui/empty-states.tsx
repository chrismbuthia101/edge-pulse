import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Wifi,
  WifiOff,
  Clock,
  Search,
  Plus,
  Activity,
  Server,
  AlertCircle,
  CheckCircle
} from "lucide-react";
import Link from "next/link";

export function EmptyAlerts() {
  return (
    <Card className="text-center py-12">
      <CardContent className="space-y-4">
        <div className="mx-auto w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center">
          <CheckCircle className="h-8 w-8 text-green-500" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">No Security Alerts</h3>
          <p className="text-muted-foreground max-w-sm mx-auto">
            Your network is secure. All systems are operating normally.
          </p>
        </div>
        <div className="flex justify-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/dashboard/devices">View Devices</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/dashboard/live">Live Feed</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function EmptyDevices() {
  return (
    <Card className="text-center py-12">
      <CardContent className="space-y-4">
        <div className="mx-auto w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center">
          <Server className="h-8 w-8 text-blue-500" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">No Devices Connected</h3>
          <p className="text-muted-foreground max-w-sm mx-auto">
            Start monitoring devices by enrolling them in your network.
          </p>
        </div>
        <Button asChild>
          <Link href="/dashboard/devices/enroll">
            <Plus className="h-4 w-4 mr-2" />
            Enroll Device
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function EmptyLiveFeed() {
  return (
    <Card className="text-center py-12">
      <CardContent className="space-y-4">
        <div className="mx-auto w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center">
          <Activity className="h-8 w-8 text-orange-500" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Waiting for Live Events</h3>
          <p className="text-muted-foreground max-w-sm mx-auto">
            Real-time events will appear here as they happen.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2">
          <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
          <span className="text-sm text-muted-foreground">Connecting to stream...</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function EmptyInsights() {
  return (
    <Card className="text-center py-12">
      <CardContent className="space-y-4">
        <div className="mx-auto w-16 h-16 bg-purple-500/10 rounded-full flex items-center justify-center">
          <Shield className="h-8 w-8 text-purple-500" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">No Insights Available</h3>
          <p className="text-muted-foreground max-w-sm mx-auto">
            ML insights will appear once we have enough data to analyze.
          </p>
        </div>
        <Badge variant="secondary" className="mx-auto">
          <Clock className="h-3 w-3 mr-1" />
          Requires 24 hours of data
        </Badge>
      </CardContent>
    </Card>
  );
}

export function EmptyNotifications() {
  return (
    <Card className="text-center py-12">
      <CardContent className="space-y-4">
        <div className="mx-auto w-16 h-16 bg-gray-500/10 rounded-full flex items-center justify-center">
          <AlertCircle className="h-8 w-8 text-gray-500" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">No Notifications</h3>
          <p className="text-muted-foreground max-w-sm mx-auto">
            You&apos;re all caught up! New notifications will appear here.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/dashboard/settings/notifications">Manage Preferences</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function EmptySearch({ query }: { query: string }) {
  return (
    <Card className="text-center py-12">
      <CardContent className="space-y-4">
        <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center">
          <Search className="h-8 w-8 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">No Results Found</h3>
          <p className="text-muted-foreground max-w-sm mx-auto">
            No results found for &quot;{query}&quot;. Try adjusting your search terms.
          </p>
        </div>
        <Button variant="outline" onClick={() => window.history.back()}>
          Go Back
        </Button>
      </CardContent>
    </Card>
  );
}

export function EmptySyncQueue() {
  return (
    <Card className="text-center py-12">
      <CardContent className="space-y-4">
        <div className="mx-auto w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center">
          <CheckCircle className="h-8 w-8 text-green-500" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Sync Queue Empty</h3>
          <p className="text-muted-foreground max-w-sm mx-auto">
            All data has been synchronized successfully.
          </p>
        </div>
        <Badge variant="secondary" className="mx-auto">
          <Wifi className="h-3 w-3 mr-1" />
          Connected
        </Badge>
      </CardContent>
    </Card>
  );
}

export function EmptyOfflineQueue() {
  return (
    <Card className="text-center py-12">
      <CardContent className="space-y-4">
        <div className="mx-auto w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center">
          <WifiOff className="h-8 w-8 text-orange-500" />
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Offline Mode</h3>
          <p className="text-muted-foreground max-w-sm mx-auto">
            Data will sync when connection is restored.
          </p>
        </div>
        <Badge variant="secondary" className="mx-auto">
          <WifiOff className="h-3 w-3 mr-1" />
          Offline
        </Badge>
      </CardContent>
    </Card>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <Card className="text-center py-12">
      <CardContent className="space-y-4">
        <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center">
          {icon}
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-muted-foreground max-w-sm mx-auto">{description}</p>
        </div>
        {badge && <div className="flex justify-center">{badge}</div>}
        {action && <div className="flex justify-center">{action}</div>}
      </CardContent>
    </Card>
  );
}
