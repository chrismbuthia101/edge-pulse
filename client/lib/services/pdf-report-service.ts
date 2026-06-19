import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";

export interface ReportData {
  title: string;
  dateRange: { start: Date; end: Date };
  generatedAt: Date;
  executiveSummary: {
    totalAlerts: number;
    criticalAlerts: number;
    devicesMonitored: number;
    mlAccuracy: number;
  };
  alertTrends: Array<{ date: string; count: number }>;
  deviceRiskMatrix: Array<{
    deviceId: string;
    deviceName: string;
    riskScore: number;
    status: string;
  }>;
  distribution: {
    bySeverity: { critical: number; high: number; medium: number; low: number };
    byCategory: { anomaly: number; security: number; system: number };
  };
  topDevices: Array<{
    deviceName: string;
    alertCount: number;
    avgRiskScore: number;
  }>;
  criticalIncidents: Array<{
    id: string;
    deviceName: string;
    severity: string;
    description: string;
    timestamp: Date;
  }>;
  mlPerformance: {
    modelVersion: string;
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
  };
}

export interface ChartImage {
  id: string;
  imageData: string;
  title: string;
}

export class PDFReportService {
  private doc: jsPDF;
  private pageWidth: number;
  private pageHeight: number;
  private margin: number = 20;

  constructor() {
    this.doc = new jsPDF();
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();
  }

  /**
   * Capture a chart element as an image using html2canvas
   */
  async captureChart(elementId: string, title: string): Promise<ChartImage> {
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error(`Element with id "${elementId}" not found`);
    }

    const canvas = await html2canvas(element, {
      backgroundColor: "#ffffff",
      scale: 2,
      logging: false,
    });

    const imageData = canvas.toDataURL("image/png");

    return {
      id: elementId,
      imageData,
      title,
    };
  }

  /**
   * Generate a complete PDF report with charts
   */
  async generateReport(
    data: ReportData,
    chartImages?: ChartImage[],
  ): Promise<Blob> {
    this.doc = new jsPDF();
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();

    // Cover Page
    this.addCoverPage(data);

    // Executive Summary
    this.addExecutiveSummary(data);

    // Alert Trends (with chart if provided)
    const trendChart = chartImages?.find((c) => c.id === "alert-trends-chart");
    if (trendChart) {
      await this.addChartSection(trendChart);
    } else {
      this.addAlertTrendsTable(data.alertTrends);
    }

    // Device Risk Matrix
    this.addDeviceRiskMatrix(data.deviceRiskMatrix);

    // Distribution (with charts if provided)
    const severityChart = chartImages?.find(
      (c) => c.id === "severity-distribution-chart",
    );
    const categoryChart = chartImages?.find(
      (c) => c.id === "category-distribution-chart",
    );

    if (severityChart || categoryChart) {
      await this.addDistributionCharts(
        data.distribution,
        severityChart,
        categoryChart,
      );
    } else {
      this.addDistributionTable(data.distribution);
    }

    // Top Devices
    this.addTopDevices(data.topDevices);

    // Critical Incidents
    this.addCriticalIncidents(data.criticalIncidents);

    // ML Performance
    this.addMLPerformance(data.mlPerformance);

    // Footer on all pages
    this.addFooter();

    return this.doc.output("blob");
  }

  /**
   * Generate CSV export
   */
  generateCSV(data: ReportData): string {
    const headers = [
      "Alert ID",
      "Severity",
      "Anomaly Score",
      "Device Name",
      "Timestamp",
      "Description",
      "Category",
    ];

    const rows = data.criticalIncidents.map((incident) => [
      incident.id,
      incident.severity,
      "N/A", // Anomaly score would come from full alert data
      incident.deviceName,
      incident.timestamp.toISOString(),
      incident.description,
      "N/A", // Category would come from full alert data
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    return csvContent;
  }

  private addCoverPage(data: ReportData): void {
    this.doc.setFillColor(15, 23, 42);
    this.doc.rect(0, 0, this.pageWidth, this.pageHeight, "F");

    this.doc.setTextColor(255, 255, 255);
    this.doc.setFontSize(32);
    this.doc.setFont("helvetica", "bold");
    this.doc.text("EdgePulse", this.pageWidth / 2, 80, { align: "center" });

    this.doc.setFontSize(24);
    this.doc.setFont("helvetica", "normal");
    this.doc.text("Security Intelligence Report", this.pageWidth / 2, 100, {
      align: "center",
    });

    this.doc.setFontSize(12);
    this.doc.setTextColor(148, 163, 184);
    this.doc.text(
      `Generated on ${data.generatedAt.toLocaleDateString()}`,
      this.pageWidth / 2,
      150,
      { align: "center" },
    );

    this.doc.text(
      `Period: ${data.dateRange.start.toLocaleDateString()} - ${data.dateRange.end.toLocaleDateString()}`,
      this.pageWidth / 2,
      165,
      { align: "center" },
    );

    this.doc.setDrawColor(59, 130, 246);
    this.doc.setLineWidth(2);
    this.doc.line(this.margin, 200, this.pageWidth - this.margin, 200);

    this.doc.setTextColor(255, 255, 255);
    this.doc.setFontSize(10);
    this.doc.text("CONFIDENTIAL", this.pageWidth / 2, 220, { align: "center" });

    this.doc.addPage();
  }

  private addExecutiveSummary(data: ReportData): void {
    this.addSectionHeader("Executive Summary");

    const summaryData = [
      ["Total Alerts", data.executiveSummary.totalAlerts.toString()],
      ["Critical Alerts", data.executiveSummary.criticalAlerts.toString()],
      ["Devices Monitored", data.executiveSummary.devicesMonitored.toString()],
      [
        "ML Accuracy",
        `${(data.executiveSummary.mlAccuracy * 100).toFixed(1)}%`,
      ],
    ];

    autoTable(this.doc, {
      startY: 40,
      head: [["Metric", "Value"]],
      body: summaryData,
      theme: "striped",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
      },
      margin: { left: this.margin, right: this.margin },
    });

    this.doc.addPage();
  }

  private async addChartSection(chart: ChartImage): Promise<void> {
    this.addSectionHeader(chart.title);

    const imgWidth = this.pageWidth - this.margin * 2;
    const imgHeight = 150;

    this.doc.addImage(
      chart.imageData,
      "PNG",
      this.margin,
      40,
      imgWidth,
      imgHeight,
    );

    this.doc.addPage();
  }

  private addAlertTrendsTable(
    trends: Array<{ date: string; count: number }>,
  ): void {
    this.addSectionHeader("Alert Trends");

    const tableData = trends.map((t) => [t.date, t.count.toString()]);

    autoTable(this.doc, {
      startY: 40,
      head: [["Date", "Alert Count"]],
      body: tableData,
      theme: "striped",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
      },
      margin: { left: this.margin, right: this.margin },
    });

    this.doc.addPage();
  }

  private addDeviceRiskMatrix(
    devices: Array<{
      deviceId: string;
      deviceName: string;
      riskScore: number;
      status: string;
    }>,
  ): void {
    this.addSectionHeader("Device Risk Matrix");

    const tableData = devices.map((d) => [
      d.deviceName,
      d.riskScore.toFixed(2),
      d.status,
    ]);

    autoTable(this.doc, {
      startY: 40,
      head: [["Device Name", "Risk Score", "Status"]],
      body: tableData,
      theme: "striped",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
      },
      margin: { left: this.margin, right: this.margin },
    });

    this.doc.addPage();
  }

  private async addDistributionCharts(
    distribution: ReportData["distribution"],
    severityChart?: ChartImage,
    categoryChart?: ChartImage,
  ): Promise<void> {
    this.addSectionHeader("Alert Distribution");

    let yPos = 40;

    if (severityChart) {
      this.doc.addImage(
        severityChart.imageData,
        "PNG",
        this.margin,
        yPos,
        (this.pageWidth - this.margin * 2) / 2 - 5,
        100,
      );
      yPos += 110;
    }

    if (categoryChart) {
      this.doc.addImage(
        categoryChart.imageData,
        "PNG",
        this.pageWidth / 2 + 5,
        40,
        (this.pageWidth - this.margin * 2) / 2 - 5,
        100,
      );
    }

    this.doc.addPage();
  }

  private addDistributionTable(distribution: ReportData["distribution"]): void {
    this.addSectionHeader("Alert Distribution");

    const severityData = [
      ["Critical", distribution.bySeverity.critical.toString()],
      ["High", distribution.bySeverity.high.toString()],
      ["Medium", distribution.bySeverity.medium.toString()],
      ["Low", distribution.bySeverity.low.toString()],
    ];

    const categoryData = [
      ["Anomaly", distribution.byCategory.anomaly.toString()],
      ["Security", distribution.byCategory.security.toString()],
      ["System", distribution.byCategory.system.toString()],
    ];

    autoTable(this.doc, {
      startY: 40,
      head: [["Severity", "Count"]],
      body: severityData,
      theme: "striped",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
      },
      margin: { left: this.margin, right: this.margin },
    });

    const lastY =
      (this.doc as { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY || 100;

    autoTable(this.doc, {
      startY: lastY + 10,
      head: [["Category", "Count"]],
      body: categoryData,
      theme: "striped",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
      },
      margin: { left: this.margin, right: this.margin },
    });

    this.doc.addPage();
  }

  private addTopDevices(
    devices: Array<{
      deviceName: string;
      alertCount: number;
      avgRiskScore: number;
    }>,
  ): void {
    this.addSectionHeader("Top Devices by Alert Count");

    const tableData = devices.map((d) => [
      d.deviceName,
      d.alertCount.toString(),
      d.avgRiskScore.toFixed(2),
    ]);

    autoTable(this.doc, {
      startY: 40,
      head: [["Device Name", "Alert Count", "Avg Risk Score"]],
      body: tableData,
      theme: "striped",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
      },
      margin: { left: this.margin, right: this.margin },
    });

    this.doc.addPage();
  }

  private addCriticalIncidents(
    incidents: Array<{
      id: string;
      deviceName: string;
      severity: string;
      description: string;
      timestamp: Date;
    }>,
  ): void {
    this.addSectionHeader("Critical Incidents");

    const tableData = incidents.map((i) => [
      i.id,
      i.deviceName,
      i.severity,
      i.description.substring(0, 50) + "...",
      i.timestamp.toLocaleString(),
    ]);

    autoTable(this.doc, {
      startY: 40,
      head: [["ID", "Device", "Severity", "Description", "Timestamp"]],
      body: tableData,
      theme: "striped",
      headStyles: {
        fillColor: [220, 38, 38],
        textColor: [255, 255, 255],
      },
      margin: { left: this.margin, right: this.margin },
    });

    this.doc.addPage();
  }

  private addMLPerformance(performance: ReportData["mlPerformance"]): void {
    this.addSectionHeader("ML Model Performance");

    const tableData = [
      ["Model Version", performance.modelVersion],
      ["Accuracy", `${(performance.accuracy * 100).toFixed(2)}%`],
      ["Precision", `${(performance.precision * 100).toFixed(2)}%`],
      ["Recall", `${(performance.recall * 100).toFixed(2)}%`],
      ["F1 Score", performance.f1Score.toFixed(3)],
    ];

    autoTable(this.doc, {
      startY: 40,
      head: [["Metric", "Value"]],
      body: tableData,
      theme: "striped",
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
      },
      margin: { left: this.margin, right: this.margin },
    });

    this.doc.addPage();
  }

  private addSectionHeader(title: string): void {
    this.doc.setFontSize(18);
    this.doc.setFont("helvetica", "bold");
    this.doc.setTextColor(15, 23, 42);
    this.doc.text(title, this.margin, 30);
  }

  private addFooter(): void {
    const pageCount = this.doc.internal.pages.length - 1;

    for (let i = 1; i <= pageCount; i++) {
      this.doc.setPage(i);
      this.doc.setFontSize(8);
      this.doc.setFont("helvetica", "normal");
      this.doc.setTextColor(148, 163, 184);
      this.doc.text(
        `Page ${i} of ${pageCount} | CONFIDENTIAL`,
        this.pageWidth / 2,
        this.pageHeight - 10,
        { align: "center" },
      );
    }
  }
}
