"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Building2, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { useAuthStore } from "@/lib/stores/auth-store";
import { useOrganizationStore } from "@/lib/stores/organization-store";
import type { OrganizationRow } from "@/lib/supabase/types/database";

export default function OrganizationsPage() {
  const router = useRouter();
  const { user, switchOrganization, activeOrganizationId } = useAuthStore();
  const orgStore = useOrganizationStore();
  const [orgs, setOrgs] = useState<(OrganizationRow & { role: string })[]>([]);
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

      await orgStore.fetchOrganizations(orgIds);
      const loadedOrgs = orgStore.organizations;

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
  }, [user, router, switchOrganization, activeOrganizationId]);

  const handleSelectOrg = async (orgId: string) => {
    await switchOrganization(orgId);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center">
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        <defs>
          <pattern id="orgs-grid" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="hsl(var(--grid-light))" strokeWidth="0.8" opacity="0.3" />
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="hsl(var(--grid-dark))" strokeWidth="0.4" opacity="0.2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#orgs-grid)" />
      </svg>

      <div className="relative z-10 w-full max-w-2xl mx-auto p-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
        >
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
              <Logo className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground mb-1.5">
              Choose Organization
            </h1>
            <p className="text-muted-foreground text-sm">
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
                  className={`cursor-pointer transition-all hover:border-primary/50 hover:shadow-md ${
                    activeOrganizationId === org.id
                      ? "border-primary ring-1 ring-primary"
                      : ""
                  }`}
                  onClick={() => handleSelectOrg(org.id)}
                >
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                      {org.logo_url ? (
                        <Image src={org.logo_url} alt="" className="w-8 h-8 object-contain" width={32} height={32} />
                      ) : (
                        <Building2 className="h-6 w-6 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">{org.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {org.role === "ORG_ADMIN" ? "Administrator" : "Analyst"}
                        {org.domain && <span> · {org.domain}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {activeOrganizationId === org.id ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-500 font-medium">
                          <CheckCircle2 className="h-4 w-4" />
                          Active
                        </span>
                      ) : (
                        <Button variant="ghost" size="sm" className="gap-1">
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
            <Button variant="outline" onClick={() => router.push("/dashboard")}>
              Go to Dashboard
            </Button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
