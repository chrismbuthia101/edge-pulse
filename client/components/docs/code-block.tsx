"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CodeBlockProps {
  code: string;
  language?: string;
}

export function CodeBlock({ code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative group my-4">
      <div className="absolute top-3 right-3 z-10">
        <button
          onClick={handleCopy}
          className="w-7 h-7 rounded-md bg-(--landing-card) border border-(--landing-border) flex items-center justify-center text-(--landing-text-muted) hover:text-(--landing-text) hover:border-(--landing-border-light) transition-all cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
          aria-label={copied ? "Copied" : "Copy code"}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <pre className="bg-(--landing-card) border border-(--landing-border) rounded-xl p-4 overflow-x-auto">
        <code className="text-sm font-mono text-(--landing-text-secondary) leading-relaxed">
          {code}
        </code>
      </pre>
    </div>
  );
}
