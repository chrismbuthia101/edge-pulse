"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Brain,
  RefreshCw,
  Download,
  Info,
  Settings,
  Eye,
  BarChart3,
  PieChart,
  TrendingUp,
  Zap,
  Target,
  HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAlertStore } from "@/lib/stores/alert-store";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useAuth } from "@/lib/auth/useAuth";
import { cn } from "@/lib/utils";

interface ExplanationMethod {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  available: boolean;
  processingTime: number;
  accuracy: number;
}

interface FeatureExplanation {
  feature_name: string;
  attribution_score: number;
  contribution_type: "positive" | "negative" | "neutral";
  feature_value: number;
  importance_rank: number;
  confidence: number;
}

interface ExplanationResult {
  method: string;
  model_id: string;
  anomaly_score: number;
  detection_threshold: number;
  is_anomaly: boolean;
  features: FeatureExplanation[];
  confidence_score: number;
  processing_time_ms: number;
  explanation_text: string;
  top_factors: string[];
  created_at: string;
}

interface ModelPerformance {
  model_id: string;
  model_type: string;
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  avg_inference_time: number;
  total_explanations: number;
}

export default function ExplainabilityPage() {
  const { isAdmin } = useAuth();
  const [selectedMethod, setSelectedMethod] = useState<string>("shap");
  const [selectedAlert, setSelectedAlert] = useState<string | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<string>("all");
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [comparisonMode, setComparisonMode] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const alerts = useAlertStore((s) => s.alerts);
  const devices = useDeviceStore((s) => s.devices);

  const filteredAlerts = useMemo(() => {
    if (isAdmin) return alerts;

    return alerts.filter((alert) => {
      const assignedDeviceIds = devices.map((device) => device.id);
      return assignedDeviceIds.includes(alert.device_id);
    });
  }, [alerts, devices, isAdmin]);

  const filteredDevices = useMemo(() => {
    if (isAdmin) return devices;

    return devices;
  }, [devices, isAdmin]);

  const explanationMethods: ExplanationMethod[] = useMemo(
    () => [
      {
        id: "shap",
        name: "SHAP",
        description: "Shapley Additive Explanations - Game theory approach",
        icon: BarChart3,
        available: true,
        processingTime: 45,
        accuracy: 92,
      },
      {
        id: "lime",
        name: "LIME",
        description: "Local Interpretable Model-agnostic Explanations",
        icon: PieChart,
        available: true,
        processingTime: 38,
        accuracy: 88,
      },
      {
        id: "integrated_gradients",
        name: "Integrated Gradients",
        description: "Path integral approach for attribution",
        icon: TrendingUp,
        available: false,
        processingTime: 52,
        accuracy: 90,
      },
      {
        id: "attention",
        name: "Attention Visualization",
        description: "Neural network attention weights",
        icon: Target,
        available: false,
        processingTime: 25,
        accuracy: 85,
      },
    ],
    [],
  );

  const mockExplanationResults: ExplanationResult[] = useMemo(() => {
    return filteredAlerts.slice(0, 5).map((alert, index) => {
      const seed = alert.anomaly_score * 1000 + index;
      const hash = (x: number) => {
        x = ((x >> 16) ^ x) * 0x45d9f3b;
        x = ((x >> 16) ^ x) * 0x45d9f3b;
        x = (x >> 16) ^ x;
        return (x % 1000) / 1000; // Normalize to 0-1
      };

      const generateFeature = (
        name: string,
        rank: number,
        baseScore: number,
      ): FeatureExplanation => {
        const seedValue = hash(seed + name.charCodeAt(0) + rank);
        const attributionScore = baseScore + (seedValue - 0.5) * 0.2;
        const contributionType =
          attributionScore > 0.05
            ? "positive"
            : attributionScore < -0.05
              ? "negative"
              : "neutral";
        const confidence = 0.7 + seedValue * 0.3;
        const importance = rank + 1;

        return {
          feature_name: name,
          attribution_score: parseFloat(attributionScore.toFixed(3)),
          contribution_type: contributionType as
            | "positive"
            | "negative"
            | "neutral",
          feature_value: parseFloat((hash(seed + rank * 10) * 100).toFixed(2)),
          importance_rank: importance,
          confidence: parseFloat(confidence.toFixed(3)),
        };
      };

      const features: FeatureExplanation[] = [
        generateFeature("cpu_usage", 1, alert.anomaly_score * 0.8),
        generateFeature("memory_usage", 2, alert.anomaly_score * 0.6),
        generateFeature("network_io", 3, alert.anomaly_score * 0.4),
        generateFeature("disk_io", 4, alert.anomaly_score * 0.3),
        generateFeature("process_count", 5, alert.anomaly_score * 0.2),
        generateFeature("connection_count", 6, alert.anomaly_score * 0.1),
      ].sort(
        (a, b) => Math.abs(b.attribution_score) - Math.abs(a.attribution_score),
      );

      return {
        method: selectedMethod,
        model_id: "isolation_forest_v2",
        anomaly_score: alert.anomaly_score,
        detection_threshold: 0.75,
        is_anomaly: alert.anomaly_score > 0.75,
        features,
        confidence_score: 0.85 + hash(seed + 100) * 0.15,
        processing_time_ms: 45 + Math.floor(hash(seed + 200) * 30),
        explanation_text: `This anomaly was primarily driven by ${features[0]?.feature_name || "system metrics"} with a contribution score of ${features[0]?.attribution_score.toFixed(3) || "0.000"}.`,
        top_factors: features.slice(0, 3).map((f) => f.feature_name),
        created_at: alert.created_at,
      };
    });
  }, [filteredAlerts, selectedMethod]);

  const modelPerformance: ModelPerformance[] = useMemo(
    () => [
      {
        model_id: "isolation_forest_v2",
        model_type: "Isolation Forest",
        accuracy: 99.9,
        precision: 99.7,
        recall: 99.8,
        f1_score: 99.75,
        avg_inference_time: 12,
        total_explanations: 1247,
      },
      {
        model_id: "autoencoder_v1",
        model_type: "Autoencoder",
        accuracy: 98.5,
        precision: 97.8,
        recall: 98.2,
        f1_score: 98.0,
        avg_inference_time: 28,
        total_explanations: 892,
      },
    ],
    [],
  );

  const currentExplanation = mockExplanationResults[0];
  const selectedMethodData = explanationMethods.find(
    (m) => m.id === selectedMethod,
  );

  const getContributionColor = (type: string) => {
    switch (type) {
      case "positive":
        return "text-destructive bg-destructive/10 border-destructive/20";
      case "negative":
        return "text-primary bg-primary/10 border-primary/20";
      case "neutral":
        return "text-muted-foreground bg-muted border-border";
      default:
        return "text-muted-foreground bg-muted border-border";
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return "text-green-500";
    if (confidence >= 0.7) return "text-amber-500";
    return "text-red-500";
  };

  const formatTimeAgo = (dateString: string): string => {
    const now = new Date();
    const past = new Date(dateString);
    const diffMs = now.getTime() - past.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  const handleGenerateExplanation = async () => {
    setLoading(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setLoading(false);
  };

  return (
    <div className="max-w-350 space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4"
      >
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-bold text-foreground">
            Explainable AI
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Advanced anomaly detection explanations with multiple XAI methods
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
            <Brain className="h-3.5 w-3.5 text-green-500" />
            <span className="text-xs font-medium text-green-600 dark:text-green-400">
              {selectedMethod.toUpperCase()} Active
            </span>
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateExplanation}
            disabled={loading}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")}
            />
            Generate
          </Button>

          <Button variant="outline" size="sm">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export
          </Button>
        </div>
      </motion.div>

      {/* XAI Methods Selection */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">
              Explanation Methods
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setComparisonMode(!comparisonMode)}
              className={cn(comparisonMode && "bg-primary/10 text-primary")}
            >
              <Eye className="h-3.5 w-3.5 mr-1.5" />
              Compare Methods
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {explanationMethods.map((method, index) => {
              const Icon = method.icon;
              return (
                <motion.div
                  key={method.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card
                    className={cn(
                      "cursor-pointer transition-all duration-200 hover:shadow-md",
                      selectedMethod === method.id
                        ? "border-primary bg-primary/5"
                        : method.available
                          ? "border-border hover:border-primary/50"
                          : "border-border opacity-50 cursor-not-allowed",
                    )}
                    onClick={() =>
                      method.available && setSelectedMethod(method.id)
                    }
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Icon
                          className={cn(
                            "h-4 w-4",
                            selectedMethod === method.id
                              ? "text-primary"
                              : "text-muted-foreground",
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-foreground truncate">
                            {method.name}
                          </h4>
                          <p className="text-xs text-muted-foreground truncate">
                            {method.processingTime}ms · {method.accuracy}%
                            accuracy
                          </p>
                        </div>
                        {!method.available && (
                          <Badge variant="secondary" className="text-xs">
                            Soon
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {method.description}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main Explanation Panel */}
        <div className="xl:col-span-2 space-y-6">
          {/* Alert Selection */}
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">
                  Select Anomaly
                </h3>
                <Select
                  value={selectedDevice}
                  onValueChange={setSelectedDevice}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="All Devices" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Devices</SelectItem>
                    {filteredDevices.map((device) => (
                      <SelectItem key={device.id} value={device.id}>
                        {device.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                {alerts.slice(0, 3).map((alert, index) => (
                  <motion.div
                    key={alert.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card
                      className={cn(
                        "cursor-pointer transition-all duration-200",
                        selectedAlert === alert.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50",
                      )}
                      onClick={() => setSelectedAlert(alert.id)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-foreground truncate">
                                {alert.title}
                              </span>
                              <Badge
                                variant={
                                  alert.anomaly_score > 0.9
                                    ? "destructive"
                                    : "secondary"
                                }
                                className="text-xs"
                              >
                                {alert.anomaly_score.toFixed(2)}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {alert.device_id} ·{" "}
                              {formatTimeAgo(alert.created_at)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {selectedMethod.toUpperCase()}
                            </Badge>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Feature Attribution Visualization */}
          {currentExplanation && (
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Feature Attribution
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Summary */}
                <div className="p-3 bg-muted/30 rounded-lg">
                  <p className="text-sm text-foreground mb-2">
                    {currentExplanation.explanation_text}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      Confidence:{" "}
                      {currentExplanation.confidence_score.toFixed(2)}
                    </span>
                    <span>
                      Processing: {currentExplanation.processing_time_ms}ms
                    </span>
                    <span>Method: {selectedMethod.toUpperCase()}</span>
                  </div>
                </div>

                {/* Feature Bars */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-foreground">
                      Feature Contributions
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAdvanced(!showAdvanced)}
                    >
                      <Settings className="h-3.5 w-3.5 mr-1" />
                      {showAdvanced ? "Simple" : "Advanced"}
                    </Button>
                  </div>

                  {currentExplanation.features.map((feature, index) => {
                    const width = Math.abs(feature.attribution_score) * 100;

                    return (
                      <motion.div
                        key={feature.feature_name}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-foreground">
                                {feature.feature_name}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                #{feature.importance_rank}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2">
                              <span
                                className={cn(
                                  "text-sm font-mono font-bold",
                                  getContributionColor(
                                    feature.contribution_type,
                                  ).replace("text-", ""),
                                )}
                              >
                                {feature.contribution_type === "positive"
                                  ? "+"
                                  : ""}
                                {feature.attribution_score.toFixed(3)}
                              </span>
                              {showAdvanced && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <HelpCircle className="h-3 w-3 text-muted-foreground" />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p className="text-xs">
                                        Value:{" "}
                                        {feature.feature_value.toFixed(2)}
                                      </p>
                                      <p className="text-xs">
                                        Confidence:{" "}
                                        {(feature.confidence * 100).toFixed(1)}%
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <motion.div
                                className={cn(
                                  "h-full rounded-full",
                                  feature.contribution_type === "positive"
                                    ? "bg-destructive"
                                    : feature.contribution_type === "negative"
                                      ? "bg-primary"
                                      : "bg-muted-foreground",
                                )}
                                initial={{ width: 0 }}
                                animate={{ width: `${width}%` }}
                                transition={{
                                  delay: 0.3 + index * 0.05,
                                  duration: 0.6,
                                  ease: "easeOut",
                                }}
                              />
                            </div>
                            {showAdvanced && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <div
                                  className={cn(
                                    "w-2 h-2 rounded-full",
                                    getConfidenceColor(
                                      feature.confidence,
                                    ).replace("text-", "bg-"),
                                  )}
                                />
                                <span>
                                  {(feature.confidence * 100).toFixed(0)}%
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4 pt-4 border-t border-border">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="w-3 h-2 rounded-full bg-destructive" />
                    Increases anomaly risk
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="w-3 h-2 rounded-full bg-primary" />
                    Decreases anomaly risk
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="w-3 h-2 rounded-full bg-muted-foreground" />
                    Neutral impact
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          {/* Model Performance */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-violet-500" />
                Model Performance
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {modelPerformance.map((model, index) => (
                <div key={model.model_id} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-foreground">
                      {model.model_type}
                    </h4>
                    <Badge variant="secondary" className="text-xs">
                      {model.total_explanations} explanations
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-muted-foreground">Accuracy</p>
                      <p className="font-bold text-green-500">
                        {model.accuracy}%
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">F1 Score</p>
                      <p className="font-bold text-primary">
                        {model.f1_score}%
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Precision</p>
                      <p className="font-bold text-amber-500">
                        {model.precision}%
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Recall</p>
                      <p className="font-bold text-blue-500">{model.recall}%</p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">
                        Avg Inference
                      </span>
                      <span className="font-medium">
                        {model.avg_inference_time}ms
                      </span>
                    </div>
                    <Progress
                      value={(model.avg_inference_time / 50) * 100}
                      className="h-1"
                    />
                  </div>

                  {index < modelPerformance.length - 1 && (
                    <div className="border-t border-border pt-3" />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Method Comparison */}
          {comparisonMode && (
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Target className="h-5 w-5 text-amber-500" />
                  Method Comparison
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {explanationMethods
                  .filter((m) => m.available)
                  .map((method) => (
                    <div key={method.id} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <method.icon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            {method.name}
                          </span>
                        </div>
                        <Badge
                          variant={
                            selectedMethod === method.id
                              ? "default"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {selectedMethod === method.id
                            ? "Active"
                            : "Available"}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Speed</span>
                          <span className="font-medium">
                            {method.processingTime}ms
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Accuracy
                          </span>
                          <span className="font-medium">
                            {method.accuracy}%
                          </span>
                        </div>
                      </div>

                      <Progress value={method.accuracy} className="h-1" />
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}

          {/* Quick Stats */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Info className="h-5 w-5 text-blue-500" />
                Explanation Stats
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Total Explanations
                  </p>
                  <p className="text-xl font-bold text-foreground">
                    {modelPerformance
                      .reduce((sum, m) => sum + m.total_explanations, 0)
                      .toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Avg Confidence
                  </p>
                  <p className="text-xl font-bold text-green-500">
                    {currentExplanation
                      ? (currentExplanation.confidence_score * 100).toFixed(1)
                      : "0"}
                    %
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Active Method</span>
                  <span className="font-medium">
                    {selectedMethod.toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Processing Time</span>
                  <span className="font-medium">
                    {selectedMethodData?.processingTime || 0}ms
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
