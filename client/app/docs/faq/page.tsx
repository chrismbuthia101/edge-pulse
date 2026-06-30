"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { DocPage, DocSection } from "@/components/docs/doc-page";

const faqs = [
  {
    q: "What platforms does the agent support?",
    a: "Linux (x86_64) via .deb or .rpm packages and Windows 10+ (x64) via NSIS installer. Python wheel is available for any platform with Python 3.11–3.13.",
  },
  {
    q: "Does the agent need internet access?",
    a: "The agent runs fully offline for detection — all ML inference happens on-device. Internet is only needed to sync alerts to the dashboard. If connectivity drops, alerts are queued locally and sync automatically when reconnected.",
  },
  {
    q: "What data is sent to the cloud?",
    a: "Only anomaly scores, SHAP explanations, and alert metadata are synced. Raw system signals (CPU, network, process data) never leave the device.",
  },
  {
    q: "How are alerts generated?",
    a: "The agent collects system signals every 60s, extracts 50-dimensional feature vectors, and scores them with an Isolation Forest ensemble. Scores exceeding the threshold trigger an alert with full SHAP attribution. Alerts can be correlated across a configurable time window.",
  },
  {
    q: "What ML model does the agent use?",
    a: "The primary model is an Isolation Forest (100 trees) trained on enterprise device telemetry. An autoencoder can optionally be enabled for complementary detection. Both run entirely on-device.",
  },
  {
    q: "How do I enroll a device?",
    a: "Obtain an enrollment token from Dashboard → Devices → Enroll Device, then run `sudo edge-agent enroll YOUR_TOKEN` on the device. See the Getting Started guide for details.",
  },
  {
    q: "What are the roles and what can each do?",
    a: "Two roles: ORG_ADMIN (full access — all devices, alerts, ML Insights, user management) and ORG_ANALYST (scoped to assigned devices, alert investigation, SHAP explanations).",
  },
  {
    q: "Can I customize detection thresholds?",
    a: "Yes. Detection sensitivity can be configured via the agent config file or environment variables. The ML Insights page in the dashboard provides visualization tools for threshold tuning.",
  },
  {
    q: "How is data retained?",
    a: "Local data retention is configurable (default 30 days). Cloud-side retention depends on your Supabase configuration. The agent automatically purges data beyond the retention window.",
  },
  {
    q: "What is the agent's resource footprint?",
    a: "The agent uses approximately 128 MB RAM and 200 MB disk. CPU usage is minimal — ML inference completes in under 500ms.",
  },
  {
    q: "How do I update the agent?",
    a: "Download the latest package from the Downloads page and reinstall. The agent configuration and credentials persist across upgrades.",
  },
  {
    q: "Can I run the agent without Supabase?",
    a: "The agent can run fully offline for detection. However, the dashboard and cloud sync require a Supabase instance. See the Supabase Setup guide for deployment options.",
  },
];

function FaqItem({ question, answer, index }: { question: string; answer: string; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      className="border border-(--landing-border) rounded-xl overflow-hidden"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left text-sm font-medium text-(--landing-text) hover:bg-(--landing-card-hover) transition-colors cursor-pointer"
        aria-expanded={open}
      >
        {question}
        <ChevronDown
          className={`h-4 w-4 text-(--landing-text-muted) transition-transform duration-200 shrink-0 ml-4 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 text-sm text-(--landing-text-secondary) leading-relaxed">
              {answer}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function FaqPage() {
  return (
    <DocPage
      title="FAQ"
      subtitle="Frequently asked questions about deploying and using EdgePulse."
    >
      <DocSection title="General">
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <FaqItem key={i} question={faq.q} answer={faq.a} index={i} />
          ))}
        </div>
      </DocSection>

      <DocSection title="Still have questions?">
        <p className="text-(--landing-text-secondary) leading-relaxed">
          Contact support or open an issue on{" "}
          <a
            href="https://github.com/chrismbuthia101/edge-pulse"
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 underline"
          >
            GitHub
          </a>
          .
        </p>
      </DocSection>
    </DocPage>
  );
}
