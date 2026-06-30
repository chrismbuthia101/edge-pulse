"use client";

import { DocPage, DocSection } from "@/components/docs/doc-page";

export default function DashboardPage() {
  return (
    <DocPage
      title="Dashboard Guide"
      subtitle="A complete tour of the EdgePulse monitoring dashboard."
    >
      <DocSection title="Overview">
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          The EdgePulse dashboard provides unified visibility into your device fleet,
          with real-time anomaly detection, ML-powered insights, and comprehensive
          reporting — all role-aware.
        </p>
      </DocSection>

      <DocSection title="Overview Group">
        {[
          {
            name: "Dashboard",
            route: "/dashboard",
            desc: "Main landing page with stat cards (total devices, active alerts, inference latency, anomalies resolved), 24h anomaly activity chart, resolution rate gauge, severity distribution, and priority alert feed.",
          },
          {
            name: "Live Feed",
            route: "/dashboard/live",
            desc: "Real-time security events across all devices with filtering, pause/resume, CSV export, and connection status.",
          },
        ].map((s) => (
          <div key={s.route} className="mb-6">
            <h3 className="text-lg font-semibold text-(--landing-text) mb-1">{s.name}</h3>
            <p className="text-sm text-(--landing-text-secondary) leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </DocSection>

      <DocSection title="Detection Group">
        {[
          {
            name: "Alerts",
            route: "/dashboard/alerts",
            desc: "Full alert management with search, filtering by severity/status/date, sortable columns, pagination, bulk actions (resolve/dismiss), and per-alert SHAP explainability panel.",
          },
          {
            name: "Alert Detail",
            route: "/dashboard/alerts/[id]",
            desc: "Individual alert view with full SHAP feature attribution, timeline, and device context.",
          },
          {
            name: "Devices",
            route: "/dashboard/devices",
            desc: "Device fleet management with search/filter, device states (reporting/silent/unsynced/installed/offline), risk levels, enrollment dialog, and one-click isolation controls.",
          },
        ].map((s) => (
          <div key={s.route} className="mb-6">
            <h3 className="text-lg font-semibold text-(--landing-text) mb-1">{s.name}</h3>
            <p className="text-sm text-(--landing-text-secondary) leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </DocSection>

      <DocSection title="Intelligence Group">
        {[
          {
            name: "ML Insights",
            route: "/dashboard/ml-insights",
            roles: "ORG_ADMIN only",
            desc: "Model performance metrics, SHAP feature importance across all devices, real-time model health, inference statistics, and anomaly threshold visualization.",
          },
          {
            name: "XAI",
            route: "/dashboard/xai",
            roles: "All users",
            desc: "Explainable AI comparison across methods (SHAP, LIME, Isolation Forest). Feature attribution visualization with confidence scores.",
          },
        ].map((s) => (
          <div key={s.route} className="mb-6">
            <h3 className="text-lg font-semibold text-(--landing-text) mb-1">{s.name}</h3>
            <p className="text-xs text-cyan-400 mb-1">{s.roles}</p>
            <p className="text-sm text-(--landing-text-secondary) leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </DocSection>

      <DocSection title="System Group">
        {[
          {
            name: "Audit Log",
            route: "/dashboard/audit-log",
            desc: "Tamper-evident log viewer with hash-chain verification, search, severity filtering, and timestamp-based browsing.",
          },
          {
            name: "Notifications",
            route: "/dashboard/notifications",
            desc: "Notification center with unread tracking, filtering (all/unread/critical/info), and bulk actions.",
          },
        ].map((s) => (
          <div key={s.route} className="mb-6">
            <h3 className="text-lg font-semibold text-(--landing-text) mb-1">{s.name}</h3>
            <p className="text-sm text-(--landing-text-secondary) leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </DocSection>

      <DocSection title="Administration Group">
        {[
          {
            name: "Users",
            route: "/dashboard/users",
            roles: "ORG_ADMIN only",
            desc: "User management with invite dialog, role assignment (ORG_ADMIN / ORG_ANALYST), and status toggling.",
          },
          {
            name: "Assignments",
            route: "/dashboard/assignments",
            roles: "ORG_ADMIN only",
            desc: "Device-to-analyst assignment management for scoping access.",
          },
          {
            name: "Reports",
            route: "/dashboard/reports",
            desc: "Report generation hub with 6 sub-reports: Alert Analysis, Device Fleet, Executive Summary, Integrity Audit, ML Performance, and User Management.",
          },
          {
            name: "Settings",
            route: "/dashboard/settings",
            desc: "User settings with 8 tabs: Profile, Notifications, Security, Appearance, Agent Config, Device Enrollment, Network Topology, and Organization.",
          },
        ].map((s) => (
          <div key={s.route} className="mb-6">
            <h3 className="text-lg font-semibold text-(--landing-text) mb-1">{s.name}</h3>
            {s.roles && <p className="text-xs text-cyan-400 mb-1">{s.roles}</p>}
            <p className="text-sm text-(--landing-text-secondary) leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </DocSection>
    </DocPage>
  );
}
