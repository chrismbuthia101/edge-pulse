"use client";

import Link from "next/link";
import { DocPage, DocSection } from "@/components/docs/doc-page";
import { CodeBlock } from "@/components/docs/code-block";

export default function InstallationPage() {
  return (
    <DocPage
      title="Installation"
      subtitle="Install the EdgePulse agent on your platform of choice."
    >
      <DocSection title="System Requirements">
        <ul className="list-disc pl-6 space-y-2 text-(--landing-text-secondary) mb-6">
          <li><strong className="text-(--landing-text)">OS:</strong> Linux (x86_64) or Windows 10+ (x64)</li>
          <li><strong className="text-(--landing-text)">Python:</strong> 3.11–3.13 (for wheel installs)</li>
          <li><strong className="text-(--landing-text)">Disk:</strong> 200 MB minimum</li>
          <li><strong className="text-(--landing-text)">RAM:</strong> 128 MB minimum</li>
          <li><strong className="text-(--landing-text)">Network:</strong> Outbound HTTPS to your Supabase instance</li>
        </ul>
      </DocSection>

      <DocSection title="Download">
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          Download the latest release from the{" "}
          <Link href="/downloads" className="text-cyan-400 hover:text-cyan-300 underline">downloads page</Link>.
          The following packages are available:
        </p>
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          {[
            { pkg: "Debian package", file: ".deb", cmd: "dpkg -i" },
            { pkg: "RPM package", file: ".rpm", cmd: "rpm -ivh" },
            { pkg: "Windows installer", file: ".exe", cmd: "silent install" },
            { pkg: "Python wheel", file: ".whl", cmd: "pip install" },
          ].map((p) => (
            <div
              key={p.pkg}
              className="bg-(--landing-card) border border-(--landing-border) rounded-xl p-4"
            >
              <div className="text-sm font-semibold text-(--landing-text)">{p.pkg}</div>
              <div className="text-xs text-(--landing-text-muted) font-mono mt-1">{p.file}</div>
            </div>
          ))}
        </div>
      </DocSection>

      <DocSection title="Debian / Ubuntu">
        <CodeBlock code={`sudo dpkg -i edgepulse-agent_*.deb
sudo apt-get install -f`} />
        <p className="text-(--landing-text-secondary) leading-relaxed mt-4">
          The package installs the agent to <code className="text-cyan-400 text-sm">/opt/edgepulse/</code>,
          creates a systemd service, and places default config at{" "}
          <code className="text-cyan-400 text-sm">/etc/edgepulse/agent_config.json</code>.
        </p>
      </DocSection>

      <DocSection title="Fedora / RHEL">
        <CodeBlock code={`sudo rpm -ivh edgepulse-agent-*.rpm
# or
sudo dnf install edgepulse-agent-*.rpm`} />
      </DocSection>

      <DocSection title="Windows">
        <CodeBlock code={`# GUI install
EdgePulse-Agent-Setup-*.exe

# Silent install
EdgePulse-Agent-Setup-*.exe /S

# Silent uninstall
"C:\\Program Files\\EdgePulse\\uninstall.exe" /S`} />
        <p className="text-(--landing-text-secondary) leading-relaxed mt-4">
          The installer places the agent at{" "}
          <code className="text-cyan-400 text-sm">C:\Program Files\EdgePulse\</code>{" "}
          with data at{" "}
          <code className="text-cyan-400 text-sm">C:\ProgramData\EdgePulse\</code>.
        </p>
      </DocSection>

      <DocSection title="Python Wheel (Any Platform)">
        <CodeBlock code={`pip install edge_agent-*.whl
edge-agent run`} />
      </DocSection>

      <DocSection title="Verification">
        <p className="text-(--landing-text-secondary) leading-relaxed mb-4">
          Verify the installation:
        </p>
        <CodeBlock code={`edge-agent --help
edge-agent run --version`} />
      </DocSection>

      <DocSection title="Next Steps">
        <ul className="list-disc pl-6 space-y-2 text-(--landing-text-secondary)">
          <li>
            <Link href="/docs/getting-started" className="text-cyan-400 hover:text-cyan-300 underline">Getting Started guide</Link>
          </li>
          <li>
            <Link href="/docs/configuration" className="text-cyan-400 hover:text-cyan-300 underline">Configure the agent</Link>
          </li>
        </ul>
      </DocSection>
    </DocPage>
  );
}
