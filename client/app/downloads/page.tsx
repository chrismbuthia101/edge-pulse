"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Download,
  Package,
  Terminal,
  Monitor,
  FileText,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  ChevronRight
} from "lucide-react";
import { BackgroundLayers } from "@/components/landing/background-layers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Asset {
  name: string;
  size: number;
  browser_download_url: string;
  digest?: string;
}

interface Release {
  tag_name: string;
  html_url: string;
  assets: Asset[];
  zipball_url: string;
  tarball_url: string;
  published_at: string;
}

const GITHUB_API = "https://api.github.com/repos/chrismbuthia101/edge-pulse/releases/latest";

const platformConfig = [
  {
    id: "deb",
    label: "Debian / Ubuntu",
    icon: Terminal,
    match: (name: string) => name.endsWith(".deb"),
    gradient: "from-cyan-500 to-blue-600",
  },
  {
    id: "rpm",
    label: "Fedora / RHEL",
    icon: Package,
    match: (name: string) => name.endsWith(".rpm"),
    gradient: "from-violet-500 to-purple-600",
  },
  {
    id: "exe",
    label: "Windows",
    icon: Monitor,
    match: (name: string) => name.endsWith(".exe"),
    gradient: "from-emerald-500 to-teal-600",
  },
];

function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(1)} ${units[i]}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function AssetSkeleton() {
  return (
    <Card className="bg-(--landing-card) border-(--landing-border)">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </CardContent>
      <CardFooter>
        <Skeleton className="h-10 w-full rounded-lg" />
      </CardFooter>
    </Card>
  );
}

export default function DownloadsPage() {
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRelease = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(GITHUB_API);
      if (!res.ok) throw new Error(`GitHub API responded with ${res.status}`);
      const data = await res.json();
      setRelease({
        tag_name: data.tag_name,
        html_url: data.html_url,
        assets: data.assets.map((a: { name: string; size: number; browser_download_url: string; digest?: string }) => ({
          name: a.name,
          size: a.size,
          browser_download_url: a.browser_download_url,
          digest: a.digest,
        })),
        zipball_url: data.zipball_url,
        tarball_url: data.tarball_url,
        published_at: data.published_at,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch release data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRelease();
  }, [fetchRelease]);

  const platformAssets = platformConfig.map((platform) => ({
    ...platform,
    asset: release?.assets.find((a) => platform.match(a.name)) ?? null,
  }));

  const shaAsset = release?.assets.find((a) => a.name === "SHA256SUMS");

  return (
    <div className="relative min-h-screen bg-(--landing-bg) overflow-x-hidden">
      <BackgroundLayers grid noise glow="cyan" />

      {/* Nav bar spacer */}
      <div className="h-16" />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-16 md:py-24">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-(--landing-text-muted) hover:text-(--landing-text) transition-colors mb-8"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
            Back to home
          </Link>

          <div className="flex items-center justify-center gap-3 mb-4">
            <h1 className="text-4xl md:text-6xl font-black text-(--landing-text)">
              Download{" "}
              <span className="text-transparent bg-clip-text bg-linear-to-r from-cyan-400 to-blue-400">
                EdgePulse
              </span>
            </h1>
          </div>

          <p className="text-lg text-(--landing-text-secondary) max-w-2xl mx-auto mb-6">
            Download the EdgePulse agent for your platform. The agent runs silently on
            your devices, detecting behavioral anomalies in real-time.
          </p>

          {release && (
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Badge variant="outline" className="text-cyan-400 border-cyan-400/30 text-sm px-3 py-1">
                {release.tag_name}
              </Badge>
              <span className="text-sm text-(--landing-text-muted)">
                Released {formatDate(release.published_at)}
              </span>
              <a
                href={release.html_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors"
              >
                Release notes →
              </a>
            </div>
          )}

          {error && (
            <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
              <button
                onClick={fetchRelease}
                className="ml-2 inline-flex items-center gap-1 text-red-300 hover:text-red-200 underline underline-offset-2 transition-colors cursor-pointer"
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </button>
            </div>
          )}
        </motion.div>

        {/* Download cards */}
        <div className="grid md:grid-cols-3 gap-6 mb-20">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => <AssetSkeleton key={i} />)
            : platformAssets.map((platform, i) => (
                <motion.div
                  key={platform.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.1 }}
                >
                  <Card className="bg-(--landing-card) border-(--landing-border) h-full flex flex-col">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl bg-linear-to-br ${platform.gradient} flex items-center justify-center shadow-lg`}
                        >
                          <platform.icon className="h-5 w-5 text-white" aria-hidden="true" />
                        </div>
                        <div>
                          <CardTitle className="text-(--landing-text) text-base">
                            {platform.label}
                          </CardTitle>
                          {platform.asset && (
                            <CardDescription className="text-(--landing-text-muted) text-xs truncate max-w-50">
                              {platform.asset.name}
                            </CardDescription>
                          )}
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="flex-1">
                      {platform.asset ? (
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between text-(--landing-text-secondary)">
                            <span>Size</span>
                            <span className="font-mono text-(--landing-text)">
                              {formatBytes(platform.asset.size)}
                            </span>
                          </div>
                          {platform.asset.digest && (
                            <div className="flex justify-between text-(--landing-text-secondary)">
                              <span>SHA256</span>
                              <span className="font-mono text-(--landing-text-muted) text-[10px] truncate max-w-45" title={platform.asset.digest}>
                                {platform.asset.digest.slice(0, 16)}...
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-(--landing-text-muted)">Not available for this release.</p>
                      )}
                    </CardContent>

                    <CardFooter>
                      {platform.asset ? (
                        <a
                          href={platform.asset.browser_download_url}
                          download
                          className="w-full"
                        >
                          <Button variant="default" size="lg" className="w-full bg-linear-to-r from-cyan-500 to-blue-600 text-white hover:opacity-90 cursor-pointer">
                            <Download className="h-4 w-4" />
                            Download
                          </Button>
                        </a>
                      ) : (
                        <Button variant="outline" size="lg" className="w-full text-(--landing-text-muted) cursor-not-allowed" disabled>
                          Unavailable
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                </motion.div>
              ))}
        </div>

        {/* SHA256 + Source section */}
        {release && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="grid md:grid-cols-2 gap-6"
          >
            {/* Checksums */}
            <Card className="bg-(--landing-card) border-(--landing-border)">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-linear-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
                    <FileText className="h-5 w-5 text-white" aria-hidden="true" />
                  </div>
                  <div>
                    <CardTitle className="text-(--landing-text) text-base">
                      Verify Downloads
                    </CardTitle>
                    <CardDescription className="text-(--landing-text-muted) text-xs">
                      SHA256 checksums
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-(--landing-text-secondary) mb-4">
                  Verify the integrity of your downloaded files using the SHA256 checksums.
                </p>
                {shaAsset ? (
                  <a
                    href={shaAsset.browser_download_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm" className="cursor-pointer">
                      <FileText className="h-4 w-4" />
                      Download SHA256SUMS
                    </Button>
                  </a>
                ) : (
                  <p className="text-xs text-(--landing-text-muted)">Not available.</p>
                )}
              </CardContent>
            </Card>

            {/* Source code */}
            <Card className="bg-(--landing-card) border-(--landing-border)">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-linear-to-br from-gray-500 to-slate-600 flex items-center justify-center shadow-lg">
                    <ExternalLink className="h-5 w-5 text-white" aria-hidden="true" />
                  </div>
                  <div>
                    <CardTitle className="text-(--landing-text) text-base">
                      Source Code
                    </CardTitle>
                    <CardDescription className="text-(--landing-text-muted) text-xs">
                      {release.tag_name}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex gap-2">
                <a href={release.zipball_url} rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="cursor-pointer">
                    Download ZIP
                  </Button>
                </a>
                <a href={release.tarball_url} rel="noopener noreferrer">
                  <Button variant="outline" size="sm" className="cursor-pointer">
                    Download TAR.GZ
                  </Button>
                </a>
                <a
                  href={`https://github.com/chrismbuthia101/edge-pulse`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="ghost" size="sm" className="cursor-pointer">
                    <ExternalLink className="h-4 w-4" />
                    GitHub
                  </Button>
                </a>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
