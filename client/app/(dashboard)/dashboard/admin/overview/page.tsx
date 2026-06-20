"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Globe, Users, MonitorSmartphone, Activity, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/useAuth";
import { useRouter } from "next/navigation";
import { adminService } from "@/lib/services/admin-service";

interface PlatformSummary {
  total_orgs: number;
  total_devices: number;
  total_users: number;
  total_alerts: number;
}

export default function PlatformOverviewPage() {
  const { hasRole, loading } = useAuth();
  const router = useRouter();
  const [summary, setSummary] = useState<PlatformSummary>({
    total_orgs: 0,
    total_devices: 0,
    total_users: 0,
    total_alerts: 0,
  });
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !hasRole(["PLATFORM_ADMIN"])) {
      router.push("/dashboard");
    }
  }, [loading, hasRole, router]);

  useEffect(() => {
    const loadData = async () => {
      try {
        const overview = await adminService.getPlatformOverview();

        setSummary({
          total_orgs: overview.totalOrganizations,
          total_devices: overview.totalDevices,
          total_users: overview.totalUsers,
          total_alerts: overview.totalAlerts,
        });
      } finally {
        setLoadingData(false);
      }
    };
    loadData();
  }, []);

  if (!hasRole(["PLATFORM_ADMIN"])) {
    return null;
  }

  const stats = [
    { label: "Organizations", value: summary.total_orgs, icon: Globe, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Total Users", value: summary.total_users, icon: Users, color: "text-violet-500", bg: "bg-violet-500/10" },
    { label: "Devices", value: summary.total_devices, icon: MonitorSmartphone, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Total Alerts", value: summary.total_alerts, icon: Activity, color: "text-amber-500", bg: "bg-amber-500/10" },
  ];

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" />
          Platform Overview
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Cross-organization platform metrics
        </p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-bold font-display mt-1">
                      {loadingData ? "..." : stat.value.toLocaleString()}
                    </p>
                  </div>
                  <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}