"use client";

import { DocPage, DocSection } from "@/components/docs/doc-page";
import { CodeBlock } from "@/components/docs/code-block";

export default function ConfigurationPage() {
  return (
    <DocPage
      title="Agent Configuration"
      subtitle="Configure the EdgePulse agent via environment variables, config file, or CLI flags."
    >
      <DocSection title="Configuration Sources">
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          The agent reads configuration from three sources, each overriding the previous:
        </p>
        <ol className="list-decimal pl-6 space-y-2 text-(--landing-text-secondary) mb-6">
          <li><strong className="text-(--landing-text)">Defaults</strong> — built-in defaults</li>
          <li><strong className="text-(--landing-text)">Config file</strong> — JSON at <code className="text-cyan-400">/etc/edgepulse/agent_config.json</code></li>
          <li><strong className="text-(--landing-text)">Environment variables</strong> — loaded from <code className="text-cyan-400">.env</code> or system env</li>
        </ol>
      </DocSection>

      <DocSection title="Environment Variables">
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          Configuration is namespaced with double underscores separating sections. Below
          is the complete reference:
        </p>

        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--landing-border)">
                <th className="text-left py-3 px-2 text-(--landing-text-muted) font-medium">Variable</th>
                <th className="text-left py-3 px-2 text-(--landing-text-muted) font-medium">Default</th>
                <th className="text-left py-3 px-2 text-(--landing-text-muted) font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-(--landing-text-secondary)">
              {[
                ["DEVICE_ID", "auto-generated", "Unique device identifier"],
                ["SUPABASE_URL", "—", "Supabase project URL"],
                ["SUPABASE_SERVICE_ROLE_KEY", "—", "Service role key for sync"],
                ["API__PORT", "8080", "Local API server port"],
                ["COLLECTION__INTERVAL", "60", "Data collection interval (seconds)"],
                ["COLLECTION__ENABLE_PROCESS_MONITORING", "true", "Collect process-level data"],
                ["COLLECTION__ENABLE_NETWORK_MONITORING", "true", "Collect network metrics"],
                ["FEATURES__FEATURE_DIMENSION", "50", "Feature vector dimension"],
                ["FEATURES__HISTORY_RETENTION_HOURS", "24", "Feature history window"],
                ["DETECTION__USE_ENSEMBLE", "true", "Use ensemble of detectors"],
                ["DETECTION__USE_AUTOENCODER", "false", "Enable autoencoder detector"],
                ["DETECTION__ISOLATION_FOREST_N_ESTIMATORS", "100", "Number of trees"],
                ["ALERTING__MIN_SEVERITY", "medium", "Minimum severity to alert"],
                ["ALERTING__CORRELATION_WINDOW", "300", "Alert correlation window (s)"],
                ["SYNC__BATCH_SIZE", "50", "Sync batch size"],
                ["SYNC__OFFLINE_QUEUE_MAX", "10000", "Max offline queue entries"],
                ["SYNC__RETRY_MAX_ATTEMPTS", "5", "Max sync retry attempts"],
                ["PRIVACY__DATA_RETENTION_DAYS", "30", "Days to retain local data"],
                ["LOG__LEVEL", "INFO", "Logging level"],
                ["METRICS__COLLECTION_INTERVAL", "30", "Metrics collection interval (s)"],
                ["HEALTH_CHECK_INTERVAL", "60", "Health check interval (s)"],
              ].map(([varName, defaultVal, desc]) => (
                <tr key={varName} className="border-b border-(--landing-border)/50">
                  <td className="py-2.5 px-2 font-mono text-xs text-cyan-400">{varName}</td>
                  <td className="py-2.5 px-2 font-mono text-xs text-(--landing-text-muted)">{defaultVal}</td>
                  <td className="py-2.5 px-2 text-xs">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DocSection>

      <DocSection title="Config File">
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          The agent reads a JSON config file from the path specified by{" "}
          <code className="text-cyan-400">--config</code> flag or the default location
          <code className="text-cyan-400"> /etc/edgepulse/agent_config.json</code>:
        </p>
        <CodeBlock language="json" code={`{
  "device_id": "optional-override",
  "supabase_url": "https://your-project.supabase.co",
  "api": { "port": 8080 },
  "collection": {
    "interval": 60,
    "enable_process_monitoring": true,
    "enable_network_monitoring": true
  },
  "features": {
    "feature_dimension": 50,
    "history_retention_hours": 24
  },
  "detection": {
    "use_ensemble": true,
    "use_autoencoder": false,
    "isolation_forest_n_estimators": 100
  },
  "alerting": {
    "min_severity": "medium",
    "correlation_window": 300
  },
  "sync": {
    "batch_size": 50,
    "offline_queue_max": 10000,
    "retry_max_attempts": 5
  },
  "privacy": {
    "data_retention_days": 30
  },
  "logging": { "level": "INFO" },
  "metrics": { "collection_interval": 30 },
  "health_check_interval": 60
}`} />
      </DocSection>

      <DocSection title="CLI Overrides">
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          Certain settings can be overridden at runtime via CLI flags:
        </p>
        <CodeBlock code={`# Custom config file
edge-agent run --config /path/to/config.json

# Verbose logging
edge-agent run --verbose

# Enroll with custom Supabase URL
edge-agent enroll TOKEN --supabase-url https://custom.supabase.co`} />
      </DocSection>
    </DocPage>
  );
}
