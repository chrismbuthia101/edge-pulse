"use client";

import { DocPage, DocSection } from "@/components/docs/doc-page";

export default function ArchitecturePage() {
  return (
    <DocPage
      title="Architecture"
      subtitle="System design overview — edge agent lifecycle, data pipeline, and ML inference."
    >
      <DocSection title="System Overview">
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          EdgePulse follows a three-tier architecture:
        </p>
        <div className="bg-(--landing-card) border border-(--landing-border) rounded-xl p-6 mb-6 font-mono text-sm text-(--landing-text-secondary) leading-relaxed">
          <p className="mb-2">
            <span className="text-cyan-400">Browser (Next.js 16)</span>
          </p>
          <p className="mb-2 pl-4">↕ Supabase JS SDK</p>
          <p className="mb-2">
            <span className="text-cyan-400">Supabase Cloud</span>
          </p>
          <p className="pl-4">├─ Auth (email/password + Google OAuth)</p>
          <p className="pl-4">├─ Postgres (data + RLS policies)</p>
          <p className="pl-4">├─ Realtime (live event feed)</p>
          <p className="mb-2 pl-4">└─ Edge Functions (Deno)</p>
          <p className="mb-2">↕ REST / Realtime</p>
          <p>
            <span className="text-cyan-400">Python Edge Agent</span>
          </p>
          <p className="pl-4">├─ Collection (CPU, network, process, disk I/O)</p>
          <p className="pl-4">├─ Feature Engineering (50-dim vectors)</p>
          <p className="pl-4">├─ ML Inference (Isolation Forest)</p>
          <p className="pl-4">├─ Alerting & Correlation</p>
          <p className="pl-4">└─ Sync (queue-and-sync to Supabase)</p>
        </div>
      </DocSection>

      <DocSection title="Edge Agent">
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          The Python agent runs on each monitored device. Key subsystems:
        </p>
        <div className="space-y-4 mb-6">
          {[
            {
              name: "Collection Pipeline",
              desc: "Periodically collects system signals — CPU usage, memory, network connections, process lists, and disk I/O — at configurable intervals (default 60s).",
            },
            {
              name: "Feature Engineering",
              desc: "Transforms raw signals into a 50-dimensional feature vector. Maintains a rolling history window for temporal context.",
            },
            {
              name: "ML Detection",
              desc: "Runs an Isolation Forest ensemble (100 trees) on the feature vector. Optionally uses an autoencoder for complementary detection. Produces anomaly scores with SHAP explanations.",
            },
            {
              name: "Alerting Engine",
              desc: "Correlates anomalies across a configurable time window (default 300s), assigns severity levels, and generates alerts with full SHAP attribution.",
            },
            {
              name: "Sync Engine",
              desc: "Queue-and-sync architecture: alerts and telemetry are queued locally (SQLite) and synced to Supabase when connectivity is available. Supports offline operation with automatic retry.",
            },
          ].map((s) => (
            <div key={s.name} className="bg-(--landing-card) border border-(--landing-border) rounded-xl p-4">
              <h4 className="text-sm font-semibold text-(--landing-text) mb-1">{s.name}</h4>
              <p className="text-sm text-(--landing-text-secondary) leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </DocSection>

      <DocSection title="Frontend">
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          The Next.js 16 dashboard communicates with Supabase via the JS SDK. The
          data layer follows a strict pattern:
        </p>
        <div className="bg-(--landing-card) border border-(--landing-border) rounded-xl p-4 mb-4 font-mono text-xs text-(--landing-text-secondary) text-center">
          Component → Store (Zustand) → Service → Repository → Supabase
        </div>
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          Each domain (alerts, devices, users, etc.) has its own store, service,
          and repository. Components only interact with stores — never directly
          with repositories.
        </p>
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          Authentication is handled by Supabase Auth with email/password and
          Google OAuth. Role-based access control restricts dashboard sections
          by <code className="text-cyan-400">ORG_ADMIN</code> or{" "}
          <code className="text-cyan-400">ORG_ANALYST</code> roles.
        </p>
      </DocSection>

      <DocSection title="Supabase Backend">
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          Supabase provides the cloud backend with:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-(--landing-text-secondary) mb-6">
          <li><strong className="text-(--landing-text)">Postgres</strong> — core data storage with Row Level Security (RLS)</li>
          <li><strong className="text-(--landing-text)">Auth</strong> — email/password and OAuth with hCaptcha protection</li>
          <li><strong className="text-(--landing-text)">Realtime</strong> — live event feed for the dashboard</li>
          <li><strong className="text-(--landing-text)">Edge Functions</strong> — serverless functions (Deno) for device enrollment, API key rotation, data sync, and more</li>
        </ul>
      </DocSection>

      <DocSection title="Data Flow">
        <ol className="list-decimal pl-6 space-y-3 text-(--landing-text-secondary)">
          <li>Agent collects system signals at regular intervals</li>
          <li>Signals are transformed into feature vectors</li>
          <li>ML model scores the vector for anomaly</li>
          <li>Anomalous scores trigger SHAP explanation computation</li>
          <li>Alerts are written to local SQLite and queued for sync</li>
          <li>Sync engine pushes alerts to Supabase (immediately or on reconnection)</li>
          <li>Dashboard fetches alerts via Supabase JS SDK with Realtime subscriptions</li>
          <li>Users interact, resolve, and investigate alerts through the dashboard</li>
        </ol>
      </DocSection>
    </DocPage>
  );
}
