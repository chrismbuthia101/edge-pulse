"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { Globe, Users, MonitorSmartphone, Activity, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/useAuth";
import { useRouter } from "next/navigation";
import { useAdminStore } from "@/lib/stores/admin-store";

export default function PlatformOverviewPage() {
  const { hasRole, loading } = useAuth();
  const router = useRouter();
  const overview = useAdminStore((s) => s.overview);
  const overviewLoading = useAdminStore((s) => s.overviewLoading);

  useEffect(() => {
    if (!loading && !hasRole(["PLATFORM_ADMIN"])) {
      router.push("/dashboard");
    }
  }, [loading, hasRole, router]);

  useEffect(() => {
    useAdminStore.getState().fetchOverview();
  }, []);

  if (!hasRole(["PLATFORM_ADMIN"])) {
    return null;
  }

  const stats = [
    { label: "Organizations", value: overview?.total_orgs ?? 0, icon: Globe, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Total Users", value: overview?.total_users ?? 0, icon: Users, color: "text-violet-500", bg: "bg-violet-500/10" },
    { label: "Devices", value: overview?.total_devices ?? 0, icon: MonitorSmartphone, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Total Alerts", value: overview?.total_alerts ?? 0, icon: Activity, color: "text-amber-500", bg: "bg-amber-500/10" },
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
                      {overviewLoading ? "..." : stat.value.toLocaleString()}
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
