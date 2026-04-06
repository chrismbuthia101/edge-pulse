"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { Download, FileText, Calendar, Shield, Database, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ForensicService, type ExportType } from "@/lib/services/forensic-service";
import type { ExportQuery } from "@/lib/repositories/forensic-repository";
import { toast } from "sonner";

interface ForensicExportProps {
  deviceId?: string;
}

export function ForensicExport({ deviceId }: ForensicExportProps) {
  const [exporting, setExporting] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return {
      start: weekAgo.toISOString().split('T')[0],
      end: now.toISOString().split('T')[0],
    };
  });

  const forensicService = new ForensicService();

  const exportOptions = [
    {
      id: "telemetry",
      name: "Telemetry Events",
      description: "Raw sensor data and system metrics",
      icon: Database,
      format: "JSON",
      estimatedSize: "2.4 GB",
    },
    {
      id: "alerts",
      name: "Alert Records",
      description: "Security alerts with full audit trail",
      icon: AlertTriangle,
      format: "CSV",
      estimatedSize: "124 MB",
    },
    {
      id: "hashchain",
      name: "Hash Chain Log",
      description: "Tamper-evident audit log",
      icon: Shield,
      format: "JSON",
      estimatedSize: "89 MB",
    },
    {
      id: "features",
      name: "Feature Vectors",
      description: "ML feature extraction data",
      icon: FileText,
      format: "Parquet",
      estimatedSize: "567 MB",
    },
  ];

  const handleExport = async (exportId: string) => {
    setExporting(exportId);
    try {
      const startDate = new Date(dateRange.start + 'T00:00:00.000Z');
      const endDate = new Date(dateRange.end + 'T23:59:59.999Z');

      const query: ExportQuery = {
        startDate,
        endDate,
        deviceId: deviceId || undefined
      };

      const option = exportOptions.find(opt => opt.id === exportId);
      if (!option) throw new Error('Invalid export option');

      const filename = forensicService.generateFilename(
        exportId as ExportType,
        dateRange.start,
        dateRange.end,
        option.format
      );

      const result = await forensicService.exportData(
        exportId as ExportType,
        query,
        { format: option.format as 'JSON' | 'CSV' | 'Parquet', filename }
      );

      // Download the file
      downloadFile(result.data as string, result.filename, result.mimeType);

      toast.success(`Successfully exported ${option.name}`);
    } catch (error) {
      console.error('Export failed:', error);
      toast.error('Export failed. Please try again.');
    } finally {
      setExporting(null);
    }
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-card border border-border rounded-xl lg:rounded-2xl overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 lg:px-5 py-3 lg:py-4 border-b border-border gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Download className="h-4 w-4 text-primary shrink-0" />
          <h3 className="text-sm font-semibold text-foreground truncate">Forensic Export</h3>
        </div>
        <div className="flex items-center gap-2 lg:gap-3 text-xs min-w-0">
          <Calendar className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">Audit Trail Export</span>
        </div>
      </div>

      {/* Date Range Selection */}
      <div className="px-4 lg:px-5 pt-4 pb-3 border-b border-border">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-foreground block mb-1.5">Start Date</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground block mb-1.5">End Date</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>
      </div>

      {/* Export Options */}
      <div className="p-4 lg:p-5 space-y-3">
        {exportOptions.map((option, index) => (
          <motion.div
            key={option.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <option.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {option.name}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {option.description}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-muted-foreground">
                    {option.format} • ~{option.estimatedSize}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => handleExport(option.id)}
              disabled={exporting === option.id}
              className={cn(
                "text-xs px-3 py-1.5 rounded-lg font-medium transition-all",
                exporting === option.id
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {exporting === option.id ? (
                <span className="flex items-center gap-1.5">
                  <motion.div
                    className="w-3 h-3 border border-current border-t-transparent rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  />
                  Exporting...
                </span>
              ) : (
                "Export"
              )}
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
