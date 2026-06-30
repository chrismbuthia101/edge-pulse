"use client";

import { DocPage, DocSection } from "@/components/docs/doc-page";

export default function SecurityPage() {
  return (
    <DocPage
      title="Security & Privacy"
      subtitle="Encryption, access control, audit logging, and compliance."
    >
      <DocSection title="Privacy-First Architecture">
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          EdgePulse is designed with privacy as a core principle. Sensitive
          telemetry never leaves your infrastructure unless explicitly configured
          for cloud sync.
        </p>
        <ul className="list-disc pl-6 space-y-2 text-(--landing-text-secondary) mb-6">
          <li><strong className="text-(--landing-text)">Edge-Native Inference</strong> — all ML detection runs on-device; no raw data is sent to the cloud</li>
          <li><strong className="text-(--landing-text)">Configurable Data Retention</strong> — local data retention is configurable (default 30 days)</li>
          <li><strong className="text-(--landing-text)">Minimal Telemetry</strong> — only anomaly scores and SHAP explanations are synced, not raw signals</li>
          <li><strong className="text-(--landing-text)">GDPR & HIPAA Ready</strong> — architecture supports compliance requirements out of the box</li>
        </ul>
      </DocSection>

      <DocSection title="Encryption">
        <ul className="list-disc pl-6 space-y-2 text-(--landing-text-secondary) mb-6">
          <li><strong className="text-(--landing-text)">In Transit</strong> — all communication between the agent and Supabase is over TLS</li>
          <li><strong className="text-(--landing-text)">At Rest</strong> — local SQLite database and credential store are encrypted</li>
          <li><strong className="text-(--landing-text)">API Keys</strong> — device API keys are stored in the OS keyring or encrypted file</li>
        </ul>
      </DocSection>

      <DocSection title="Access Control (RBAC)">
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          EdgePulse uses two built-in roles:
        </p>
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-(--landing-card) border border-(--landing-border) rounded-xl p-4">
            <h4 className="text-sm font-bold text-(--landing-text) mb-2">ORG_ADMIN</h4>
            <ul className="space-y-1 text-xs text-(--landing-text-secondary)">
              <li>✓ Full system access</li>
              <li>✓ All devices and alerts</li>
              <li>✓ ML Insights</li>
              <li>✓ User management</li>
              <li>✓ System settings</li>
              <li>✓ Device assignments</li>
            </ul>
          </div>
          <div className="bg-(--landing-card) border border-(--landing-border) rounded-xl p-4">
            <h4 className="text-sm font-bold text-(--landing-text) mb-2">ORG_ANALYST</h4>
            <ul className="space-y-1 text-xs text-(--landing-text-secondary)">
              <li>✓ Scoped to assigned devices</li>
              <li>✓ Alert investigation</li>
              <li>✓ SHAP explainability</li>
              <li>✓ Audit log view</li>
              <li>✗ ML Insights</li>
              <li>✗ User management</li>
            </ul>
          </div>
        </div>
      </DocSection>

      <DocSection title="Tamper-Evident Audit Log">
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          All security-relevant actions are recorded in a tamper-evident audit log
          with hash-chain verification:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-(--landing-text-secondary) mb-6">
          <li>Each log entry contains a hash of the previous entry</li>
          <li>Hash chain can be verified through the dashboard</li>
          <li>Any tampering is immediately detectable</li>
          <li>Integrity audit report available</li>
        </ul>
      </DocSection>

      <DocSection title="Device Isolation">
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          Administrators can isolate compromised devices from the network with
          one click from the Devices page. Isolated devices are blocked at the
          network level while still reporting to the dashboard.
        </p>
      </DocSection>

      <DocSection title="Compliance">
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          EdgePulse is designed to help organizations meet compliance requirements:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-(--landing-text-secondary) mb-6">
          <li><strong className="text-(--landing-text)">GDPR</strong> — data minimization, configurable retention, right to deletion</li>
          <li><strong className="text-(--landing-text)">HIPAA</strong> — encryption, access controls, audit trails</li>
          <li><strong className="text-(--landing-text)">SOC 2</strong> — tamper-evident logging, access controls, monitoring</li>
        </ul>
      </DocSection>
    </DocPage>
  );
}
