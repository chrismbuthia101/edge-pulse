"use client";

import Link from "next/link";
import { DocPage, DocSection } from "@/components/docs/doc-page";
import { CodeBlock } from "@/components/docs/code-block";

export default function GettingStartedPage() {
  return (
    <DocPage
      title="Getting Started"
      subtitle="Deploy EdgePulse in your environment in under 5 minutes."
    >
      <DocSection title="Overview">
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          EdgePulse detects behavioral anomalies on enterprise devices using ML
          models that run entirely at the edge. No cloud dependency, no data
          exfiltration, millisecond detection latency.
        </p>
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          The system has two main components:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-(--landing-text-secondary) mb-6">
          <li>
            <strong className="text-(--landing-text)">Edge Agent</strong> — a
            lightweight Python daemon that collects system signals, runs ML
            inference, and syncs alerts to the cloud.
          </li>
          <li>
            <strong className="text-(--landing-text)">Dashboard</strong> — a
            Next.js web application for monitoring alerts, managing devices, and
            configuring your deployment.
          </li>
        </ul>
      </DocSection>

      <DocSection title="Prerequisites">
        <ul className="list-disc pl-6 space-y-2 text-(--landing-text-secondary) mb-6">
          <li>A Linux (x86_64) or Windows 10+ device</li>
          <li>An EdgePulse cloud account (Supabase-backed)</li>
          <li>An enrollment token from the admin dashboard</li>
        </ul>
      </DocSection>

      <DocSection title="Step 1: Install the Agent">
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          Choose your platform and run the install command:
        </p>

        <h4 className="text-sm font-bold uppercase tracking-widest text-cyan-400 mb-2">
          Debian / Ubuntu
        </h4>
        <CodeBlock code={`sudo dpkg -i edgepulse-agent_*.deb
sudo apt-get install -f`} />

        <h4 className="text-sm font-bold uppercase tracking-widest text-cyan-400 mt-6 mb-2">
          Fedora / RHEL
        </h4>
        <CodeBlock code={`sudo rpm -ivh edgepulse-agent-*.rpm`} />

        <h4 className="text-sm font-bold uppercase tracking-widest text-cyan-400 mt-6 mb-2">
          Windows
        </h4>
        <CodeBlock code={`EdgePulse-Agent-Setup-*.exe /S`} />

        <p className="text-(--landing-text-secondary) leading-relaxed mt-4">
          See the <Link href="/docs/installation" className="text-cyan-400 hover:text-cyan-300 underline">Installation guide</Link> for detailed instructions.
        </p>
      </DocSection>

      <DocSection title="Step 2: Enroll the Device">
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          Obtain an enrollment token from{" "}
          <strong className="text-(--landing-text)">Dashboard → Devices → Enroll Device</strong>.
          Then run:
        </p>
        <CodeBlock code={`sudo edge-agent enroll YOUR_ENROLLMENT_TOKEN`} />
        <p className="text-(--landing-text-secondary) leading-relaxed mt-4">
          The agent registers with the backend, receives a device ID and API key,
          and is ready to start monitoring.
        </p>
      </DocSection>

      <DocSection title="Step 3: Start the Agent">
        <CodeBlock code={`sudo systemctl start edgepulse-agent
sudo systemctl status edgepulse-agent`} />
        <p className="text-(--landing-text-secondary) leading-relaxed mt-4">
          The agent begins collecting system signals (CPU, network, process, disk I/O),
          extracting features, and running ML anomaly detection. Alerts appear in
          your dashboard within seconds.
        </p>
      </DocSection>

      <DocSection title="Step 4: Explore the Dashboard">
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          Log in to your EdgePulse dashboard to:
        </p>
        <ul className="list-disc pl-6 space-y-2 text-(--landing-text-secondary) mb-6">
          <li>View the live anomaly feed</li>
          <li>Investigate alerts with SHAP explanations</li>
          <li>Manage your device fleet</li>
          <li>Generate reports</li>
          <li>Configure detection thresholds</li>
        </ul>
        <Link href="/docs/dashboard" className="text-cyan-400 hover:text-cyan-300 underline">
          Dashboard guide →
        </Link>
      </DocSection>

      <DocSection title="Next Steps">
        <ul className="list-disc pl-6 space-y-2 text-(--landing-text-secondary)">
          <li>
            <Link href="/docs/configuration" className="text-cyan-400 hover:text-cyan-300 underline">Configure the agent</Link> for your environment
          </li>
          <li>
            <Link href="/docs/cli" className="text-cyan-400 hover:text-cyan-300 underline">Explore the CLI</Link> for advanced operations
          </li>
          <li>
            <Link href="/docs/architecture" className="text-cyan-400 hover:text-cyan-300 underline">Understand the architecture</Link>
          </li>
        </ul>
      </DocSection>
    </DocPage>
  );
}
