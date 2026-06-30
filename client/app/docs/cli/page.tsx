"use client";

import { DocPage, DocSection } from "@/components/docs/doc-page";
import { CodeBlock } from "@/components/docs/code-block";

export default function CliPage() {
  return (
    <DocPage
      title="CLI Reference"
      subtitle="Complete reference for the edge-agent command-line interface."
    >
      <DocSection title="Overview">
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          The <code className="text-cyan-400">edge-agent</code> command manages the
          EdgePulse agent lifecycle. It is installed as part of the agent package
          and available at <code className="text-cyan-400">/opt/edgepulse/bin/edge-agent</code>.
        </p>
      </DocSection>

      <DocSection title="Global Usage">
        <CodeBlock code={`edge-agent <command> [options]`} />
      </DocSection>

      <DocSection title="Commands">
        <h3 className="text-lg font-semibold text-(--landing-text) mt-6 mb-3">run</h3>
        <p className="text-(--landing-text-secondary) leading-relaxed mb-3">
          Start the agent in foreground mode. The agent begins collecting system
          signals and running ML inference.
        </p>
        <CodeBlock code={`# Default (INFO logging)
edge-agent run

# Debug logging
edge-agent run --verbose

# Custom config
edge-agent run --config /etc/edgepulse/agent_config.json`} />
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--landing-border)">
                <th className="text-left py-3 px-2 text-(--landing-text-muted) font-medium">Flag</th>
                <th className="text-left py-3 px-2 text-(--landing-text-muted) font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-(--landing-text-secondary)">
              <tr className="border-b border-(--landing-border)/50">
                <td className="py-2.5 px-2 font-mono text-xs text-cyan-400">--verbose, -v</td>
                <td className="py-2.5 px-2 text-xs">Enable DEBUG logging</td>
              </tr>
              <tr className="border-b border-(--landing-border)/50">
                <td className="py-2.5 px-2 font-mono text-xs text-cyan-400">--config PATH</td>
                <td className="py-2.5 px-2 text-xs">Path to config JSON file</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="text-lg font-semibold text-(--landing-text) mt-8 mb-3">enroll</h3>
        <p className="text-(--landing-text-secondary) leading-relaxed mb-3">
          Register the device with the EdgePulse backend. Requires an enrollment
          token from the admin dashboard.
        </p>
        <CodeBlock code={`# Enroll with token
edge-agent enroll YOUR_TOKEN

# Enroll with custom Supabase URL
edge-agent enroll YOUR_TOKEN --supabase-url https://custom.supabase.co

# Enroll using config file
edge-agent enroll`} />
        <p className="text-(--landing-text-secondary) leading-relaxed mt-2 mb-3">
          When no arguments are provided, the agent reads enrollment config from{" "}
          <code className="text-cyan-400">/etc/edgepulse/enrollment.json</code>.
        </p>
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--landing-border)">
                <th className="text-left py-3 px-2 text-(--landing-text-muted) font-medium">Flag</th>
                <th className="text-left py-3 px-2 text-(--landing-text-muted) font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-(--landing-text-secondary)">
              <tr className="border-b border-(--landing-border)/50">
                <td className="py-2.5 px-2 font-mono text-xs text-cyan-400">--supabase-url URL</td>
                <td className="py-2.5 px-2 text-xs">Override Supabase URL</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 className="text-lg font-semibold text-(--landing-text) mt-8 mb-3">service</h3>
        <p className="text-(--landing-text-secondary) leading-relaxed mb-3">
          Manage the agent as a system service (Linux only).
        </p>
        <CodeBlock code={`# Install as system service
edge-agent service install

# Start the service
edge-agent service start

# Stop the service
edge-agent service stop

# Show service status
edge-agent service status

# Tail service logs
edge-agent service logs --lines 80`} />
      </DocSection>

      <DocSection title="Makefile Commands">
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          During development, the following Makefile targets are available from
          the <code className="text-cyan-400">edge-agent/</code> directory:
        </p>
        <div className="grid sm:grid-cols-2 gap-2">
          {[
            ["make install", "Install all dependencies"],
            ["make dev", "Run with DEBUG logging"],
            ["make run", "Run with INFO logging"],
            ["make lint", "Run linters"],
            ["make fmt", "Auto-format code"],
            ["make test", "Run test suite"],
            ["make wheel", "Build PyPI wheel"],
            ["make deb", "Build Debian package"],
            ["make rpm", "Build RPM package"],
            ["make windows", "Build Windows installer"],
            ["make clean", "Remove cache files"],
            ["make service-install", "Install systemd service"],
          ].map(([cmd, desc]) => (
            <div
              key={cmd}
              className="bg-(--landing-card) border border-(--landing-border) rounded-lg px-3 py-2 flex items-center gap-2"
            >
              <code className="text-xs font-mono text-cyan-400 shrink-0">{cmd}</code>
              <span className="text-xs text-(--landing-text-muted)">{desc}</span>
            </div>
          ))}
        </div>
      </DocSection>
    </DocPage>
  );
}
