"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Building2, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AuthBrandMark } from "@/components/auth/auth-visual-panel";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useOrganizationStore } from "@/lib/stores/organization-store";
import type { Organization } from "@/lib/types/organization";
import type { UserRole } from "@/lib/types/shared";

export default function OrganizationsPage() {
  const router = useRouter();
  const { user, switchOrganization, activeOrganizationId } = useAuthStore();
  const fetchOrganizations = useOrganizationStore((s) => s.fetchOrganizations);
  const [orgs, setOrgs] = useState<(Organization & { role: UserRole })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadOrgs = async () => {
      if (!user) {
        router.push("/auth/login");
        return;
      }

      const orgProfiles = user.profiles.filter((p) => p.organization_id !== null);

      if (orgProfiles.length === 0) {
        router.push("/dashboard");
        return;
      }

      if (orgProfiles.length === 1) {
        if (orgProfiles[0].organization_id !== activeOrganizationId) {
          await switchOrganization(orgProfiles[0].organization_id!);
        }
        router.push("/dashboard");
        return;
      }

      const orgIds = orgProfiles.map((p) => p.organization_id!);
      const roleMap = new Map(orgProfiles.map((p) => [p.organization_id, p.role]));

      await fetchOrganizations(orgIds);
      const loadedOrgs = useOrganizationStore.getState().organizations;

      if (loadedOrgs.length > 0) {
        setOrgs(
          loadedOrgs.map((o) => ({
            ...o,
            role: roleMap.get(o.id) ?? "ORG_ANALYST",
          })),
        );
      }
      setLoading(false);
    };

    loadOrgs();
  }, [user, router, switchOrganization, activeOrganizationId, fetchOrganizations]);

  const handleSelectOrg = async (orgId: string) => {
    await switchOrganization(orgId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          <AuthBrandMark light />
        </div>
        <h1 className="text-2xl font-display font-bold text-foreground dark:text-white mb-1.5">
          Choose Organization
        </h1>
        <p className="text-muted-foreground dark:text-slate-400 text-sm">
          Select which organization to work in
        </p>
      </div>

      <div className="grid gap-4">
        {orgs.map((org) => (
          <motion.div
            key={org.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card
              className={`cursor-pointer transition-all border-border dark:border-white/10 bg-card dark:bg-[#0a0f1d]/80 backdrop-blur-sm ${
                activeOrganizationId === org.id
                  ? "border-cyan-400 ring-1 ring-cyan-400/50"
                  : "hover:border-border dark:hover:border-white/20"
              }`}
              onClick={() => handleSelectOrg(org.id)}
            >
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                  {org.logo_url ? (
                    <Image src={org.logo_url} alt="" className="w-8 h-8 object-contain" width={32} height={32} />
                  ) : (
                    <Building2 className="h-6 w-6 text-cyan-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground dark:text-white">{org.name}</p>
                  <p className="text-sm text-muted-foreground dark:text-slate-400">
                    {org.role === "ORG_ADMIN" ? "Administrator" : "Analyst"}
                    {org.domain && <span> · {org.domain}</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {activeOrganizationId === org.id ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                      <CheckCircle2 className="h-4 w-4" />
                      Active
                    </span>
                  ) : (
                    <Button variant="ghost" size="sm" className="gap-1 text-foreground dark:text-slate-300 hover:text-foreground dark:hover:text-white hover:bg-accent dark:hover:bg-white/5">
                      Switch
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="mt-8 text-center">
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard")}
            className="border-border dark:border-white/10 text-foreground dark:text-slate-300 hover:text-foreground dark:hover:text-white hover:bg-accent dark:hover:bg-white/5"
          >
            Go to Dashboard
          </Button>
      </div>
    </div>
  );
}
