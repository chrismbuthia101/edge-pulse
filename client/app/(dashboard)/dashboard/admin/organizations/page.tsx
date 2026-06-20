"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Globe, Search, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth/useAuth";
import { useRouter } from "next/navigation";
import {
  adminService,
  type OrganizationWithCounts,
} from "@/lib/services/admin-service";
export default function PlatformOrganizationsPage() {
  const { hasRole, loading } = useAuth();
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrganizationWithCounts[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !hasRole(["PLATFORM_ADMIN"])) {
      router.push("/dashboard");
    }
  }, [loading, hasRole, router]);

  useEffect(() => {
    const loadOrgs = async () => {
      try {
        const organizations = await adminService.getOrganizationsWithCounts();
        setOrgs(organizations);
      } finally {
        setLoadingData(false);
      }
    };
    loadOrgs();
  }, []);

  const filtered = orgs.filter(
    (o) =>
      o.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      o.slug.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  if (!hasRole(["PLATFORM_ADMIN"])) return null;

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <Globe className="h-6 w-6 text-primary" />
          Organizations
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Manage all organizations on the platform
        </p>
      </motion.div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search organizations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            All Organizations ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingData ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Users</TableHead>
                  <TableHead>Devices</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((org) => (
                  <TableRow key={org.id}>
                    <TableCell className="font-medium">{org.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        {org.slug}
                      </Badge>
                    </TableCell>
                    <TableCell>{org.user_count}</TableCell>
                    <TableCell>{org.device_count}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(org.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
