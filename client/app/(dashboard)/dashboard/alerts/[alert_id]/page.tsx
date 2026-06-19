"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  Clock,
  User,
  Activity,
  ArrowLeft,
  MonitorSmartphone,
  Cpu,
  Zap,
  Network,
  Shield,
} from "lucide-react";
import { ShapChart } from "@/components/charts/ShapChart";
import { useAuth } from "@/lib/auth/useAuth";
import { useAlertStore } from "@/lib/stores/alert-store";
import { useDeviceStore } from "@/lib/stores/device-store";
import { UserRepository } from "@/lib/repositories/user-repository";
import { DeviceRepository } from "@/lib/repositories/device-repository";

interface AlertRecord {
  id: string;
  anomaly_score_id: string;
  device_id: string;
  device_name: string;
  alert_severity: string;
  alert_status: string;
  explanation_json: string | null;
  created_at: string;
  updated_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  investigated_at: string | null;
  investigated_by: string | null;
  closed_at: string | null;
  closed_by: string | null;
  title: string;
  description: string;
  category: string;
  source: string;
  inference_latency_ms: number;
  read: boolean;
}

interface ShapExplanation {
  explanation_type?: string;
  summary: {
    confidence_level: number;
    main_factors: string[];
    processing_time_ms: number;
  };
  features?: Array<{
    feature_name: string;
    feature_value: number;
    attribution_score: number;
    contribution_type: "positive" | "negative";
    rank: number;
  }>;
  base_score?: number;
  final_score?: number;
}

const userRepository = new UserRepository();
const deviceRepository = new DeviceRepository();

export default function AlertDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, hasRole } = useAuth();
  const { devices } = useDeviceStore();

  const [alert, setAlert] = useState<AlertRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [acknowledging, setAcknowledging] = useState(false);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [deviceName, setDeviceName] = useState<string>("");

  const alertId = params.alert_id as string;

  const fetchAlert = useCallback(async () => {
    try {
      setLoading(true);
      const { getAlertById } = useAlertStore.getState();
      const alertData = await getAlertById(alertId);

      if (!alertData) {
        throw new Error("Alert not found");
      }

      const alertRecord: AlertRecord = {
        id: alertData.id,
        anomaly_score_id: alertData.anomaly_score_id || "",
        device_id: alertData.device_id,
        device_name: "",
        alert_severity: alertData.severity,
        alert_status: alertData.status,
        explanation_json: JSON.stringify(alertData.explanation_json),
        created_at: alertData.created_at,
        updated_at: alertData.updated_at,
        acknowledged_at: alertData.acknowledged_at,
        acknowledged_by: alertData.acknowledged_by,
        investigated_at: alertData.investigated_at,
        investigated_by: alertData.investigated_by,
        closed_at: alertData.closed_at,
        closed_by: alertData.closed_by,
        title: alertData.title,
        description: alertData.description || "",
        category: alertData.category,
        source: alertData.telemetry_source,
        inference_latency_ms: alertData.inference_latency_ms,
        read: alertData.read,
      };

      let resolvedDeviceName = "Unknown Device";
      if (alertData.device_id) {
        const device = devices.find((d) => d.id === alertData.device_id);
        if (device) {
          resolvedDeviceName = device.name;
        } else {
          try {
            const fetchedDevice = await deviceRepository.findById(
              alertData.device_id,
            );
            resolvedDeviceName =
              fetchedDevice?.name || alertData.device_id || "Unknown Device";
          } catch (error) {
            console.error("Failed to fetch device:", error);
            resolvedDeviceName = alertData.device_id || "Unknown Device";
          }
        }
      }
      alertRecord.device_name = resolvedDeviceName;
      setDeviceName(resolvedDeviceName);

      setAlert(alertRecord);

      const userIds = [
        alertData.acknowledged_by,
        alertData.investigated_by,
        alertData.closed_by,
      ].filter(Boolean) as string[];

      const names: Record<string, string> = {};
      await Promise.all(
        userIds.map(async (userId) => {
          try {
            const userData = await userRepository.getUserById(userId);
            if (userData) {
              names[userId] = userData.full_name;
            }
          } catch (error) {
            console.error(`Failed to fetch user ${userId}:`, error);
          }
        }),
      );
      setUserNames(names);
    } catch (error) {
      console.error("Failed to fetch alert:", error);
      router.push("/dashboard/alerts");
    } finally {
      setLoading(false);
    }
  }, [alertId, router, devices]);

  useEffect(() => {
    if (alertId) fetchAlert();
  }, [alertId, fetchAlert]);

  const handleAcknowledge = async () => {
    if (!alert || !user) return;
    try {
      setAcknowledging(true);
      const { updateAlertStatus } = useAlertStore.getState();
      await updateAlertStatus(alert.id, "ACKNOWLEDGED", user.id);
      await fetchAlert();
    } catch (error) {
      console.error("Error acknowledging alert:", error);
    } finally {
      setAcknowledging(false);
    }
  };

  const getSeverityVariant = (
    severity: string,
  ): "default" | "secondary" | "destructive" | "outline" => {
    switch (severity.toLowerCase()) {
      case "critical":
      case "high":
        return "destructive";
      case "medium":
        return "default";
      default:
        return "secondary";
    }
  };

  const getStatusVariant = (
    status: string,
  ): "default" | "secondary" | "destructive" | "outline" => {
    switch (status.toLowerCase()) {
      case "pending":
        return "destructive";
      case "acknowledged":
        return "default";
      case "investigated":
        return "secondary";
      case "closed":
        return "outline";
      default:
        return "default";
    }
  };

  const telemetrySourceIcon = (source?: string) => {
    switch (source) {
      case "PROCESS":
        return <Activity className="h-4 w-4" />;
      case "NETWORK":
        return <Network className="h-4 w-4" />;
      case "FILE":
        return <Shield className="h-4 w-4" />;
      case "RESOURCE":
        return <Cpu className="h-4 w-4" />;
      default:
        return <Zap className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8 max-w-6xl">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-32 bg-muted rounded-xl"></div>
          <div className="h-64 bg-muted rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (!alert) {
    return (
      <div className="container mx-auto py-8 max-w-6xl">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-semibold mb-2">Alert Not Found</h2>
          <p className="text-muted-foreground mb-4">
            The alert you&apos;re looking for doesn&apos;t exist or you
            don&apos;t have permission to view it.
          </p>
          <Button onClick={() => router.back()}>Go Back</Button>
        </div>
      </div>
    );
  }

  let shapExplanation: ShapExplanation | null = null;
  try {
    shapExplanation = alert.explanation_json
      ? typeof alert.explanation_json === "string"
        ? JSON.parse(alert.explanation_json)
        : alert.explanation_json
      : null;
  } catch (error) {
    console.error("Error parsing SHAP explanation:", error);
  }

  return (
    <div className="container mx-auto py-8 max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Alerts
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">Alert Details</h1>
            <p className="text-sm text-muted-foreground">
              ID: {alert.id.slice(0, 8)}...
            </p>
          </div>
        </div>
        {alert.alert_status === "PENDING" &&
          hasRole(["ANALYST", "ADMINISTRATOR"]) && (
            <Button onClick={handleAcknowledge} disabled={acknowledging}>
              {acknowledging ? "Acknowledging..." : "Acknowledge Alert"}
            </Button>
          )}
      </div>

      {/* Alert Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Alert Overview</span>
            <div className="flex space-x-2">
              <Badge variant={getSeverityVariant(alert.alert_severity)}>
                {alert.alert_severity}
              </Badge>
              <Badge variant={getStatusVariant(alert.alert_status)}>
                {alert.alert_status}
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-2">{alert.title}</h3>
            {alert.description && (
              <p className="text-sm text-muted-foreground">
                {alert.description}
              </p>
            )}
          </div>

          <Separator />

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Device
              </p>
              <div className="flex items-center gap-2">
                <MonitorSmartphone className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold">
                  {deviceName || alert.device_name || "Unknown Device"}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Category
              </p>
              <p className="text-sm">{alert.category || "N/A"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Source
              </p>
              <div className="flex items-center gap-2">
                {telemetrySourceIcon(alert.source)}
                <p className="text-sm">{alert.source || "N/A"}</p>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Latency
              </p>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm">{alert.inference_latency_ms}ms</p>
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Created
              </p>
              <p className="text-sm">
                {new Date(alert.created_at).toLocaleString()}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Updated
              </p>
              <p className="text-sm">
                {new Date(alert.updated_at).toLocaleString()}
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {alert.acknowledged_by && (
              <div className="flex items-center space-x-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Acknowledged By
                  </p>
                  <p className="text-sm font-medium">
                    {userNames[alert.acknowledged_by] || alert.acknowledged_by}
                  </p>
                </div>
              </div>
            )}
            {alert.acknowledged_at && (
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Acknowledged At
                  </p>
                  <p className="text-sm">
                    {new Date(alert.acknowledged_at).toLocaleString()}
                  </p>
                </div>
              </div>
            )}
            {alert.investigated_by && (
              <div className="flex items-center space-x-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Investigated By
                  </p>
                  <p className="text-sm font-medium">
                    {userNames[alert.investigated_by] || alert.investigated_by}
                  </p>
                </div>
              </div>
            )}
            {alert.investigated_at && (
              <div className="flex items-center space-x-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Investigated At
                  </p>
                  <p className="text-sm">
                    {new Date(alert.investigated_at).toLocaleString()}
                  </p>
                </div>
              </div>
            )}
            {alert.closed_by && (
              <div className="flex items-center space-x-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Closed By
                  </p>
                  <p className="text-sm font-medium">
                    {userNames[alert.closed_by] || alert.closed_by}
                  </p>
                </div>
              </div>
            )}
            {alert.closed_at && (
              <div className="flex items-center space-x-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Closed At
                  </p>
                  <p className="text-sm">
                    {new Date(alert.closed_at).toLocaleString()}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Analysis */}
      <Tabs defaultValue="explanation" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="explanation">AI Explanation</TabsTrigger>
          <TabsTrigger value="features">Feature Analysis</TabsTrigger>
          <TabsTrigger value="raw">Raw Data</TabsTrigger>
        </TabsList>

        <TabsContent value="explanation" className="space-y-4">
          {shapExplanation ? (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>SHAP Explanation Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {shapExplanation.explanation_type && (
                      <p>
                        <strong>Explanation Type:</strong>{" "}
                        {shapExplanation.explanation_type}
                      </p>
                    )}
                    {shapExplanation.summary?.confidence_level !==
                      undefined && (
                      <p>
                        <strong>Confidence Level:</strong>{" "}
                        {(
                          shapExplanation.summary.confidence_level * 100
                        ).toFixed(1)}
                        %
                      </p>
                    )}
                    {shapExplanation.summary?.main_factors?.length > 0 && (
                      <>
                        <p>
                          <strong>Main Factors:</strong>
                        </p>
                        <ul className="list-disc list-inside space-y-1">
                          {shapExplanation.summary.main_factors.map(
                            (factor, index) => (
                              <li key={index}>{factor}</li>
                            ),
                          )}
                        </ul>
                      </>
                    )}
                    {shapExplanation.summary?.processing_time_ms !==
                      undefined && (
                      <p>
                        <strong>Processing Time:</strong>{" "}
                        {shapExplanation.summary.processing_time_ms}ms
                      </p>
                    )}
                    {shapExplanation.base_score !== undefined && (
                      <p>
                        <strong>Base Score:</strong>{" "}
                        {shapExplanation.base_score.toFixed(4)}
                      </p>
                    )}
                    {shapExplanation.final_score !== undefined && (
                      <p>
                        <strong>Final Score:</strong>{" "}
                        {shapExplanation.final_score.toFixed(4)}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {shapExplanation.features &&
                shapExplanation.features.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Feature Attribution Chart</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ShapChart data={shapExplanation.features} />
                    </CardContent>
                  </Card>
                )}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8">
                <div className="text-center text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4" />
                  <p>No explanation available for this alert</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="features" className="space-y-4">
          {shapExplanation?.features ? (
            <Card>
              <CardHeader>
                <CardTitle>Feature Contributions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {shapExplanation.features
                    .sort(
                      (a, b) =>
                        Math.abs(b.attribution_score) -
                        Math.abs(a.attribution_score),
                    )
                    .map((feature, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded"
                      >
                        <div className="flex-1">
                          <p className="font-medium">{feature.feature_name}</p>
                          <p className="text-sm text-muted-foreground">
                            Value: {feature.feature_value.toFixed(4)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p
                            className={`font-semibold ${feature.contribution_type === "positive" ? "text-red-600" : "text-green-600"}`}
                          >
                            {feature.contribution_type === "positive"
                              ? "+"
                              : "-"}
                            {Math.abs(feature.attribution_score).toFixed(4)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Rank #{feature.rank}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8">
                <div className="text-center text-muted-foreground">
                  <p>No feature analysis available</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="raw" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Raw Alert Data</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-muted text-foreground p-4 rounded overflow-x-auto">
                <pre className="text-sm">{JSON.stringify(alert, null, 2)}</pre>
              </div>
            </CardContent>
          </Card>
          {shapExplanation && (
            <Card>
              <CardHeader>
                <CardTitle>Raw Explanation Data</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted text-foreground p-4 rounded overflow-x-auto">
                  <pre className="text-sm">
                    {JSON.stringify(shapExplanation, null, 2)}
                  </pre>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
