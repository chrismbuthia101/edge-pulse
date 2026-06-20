"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Users as UsersIcon, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth/useAuth";
import { useRouter } from "next/navigation";
import { UserRepository } from "@/lib/repositories";
import { UserService } from "@/lib/services/user-service";
import { organizationService } from "@/lib/services/organization-service";

const roleColors: Record<string, string> = {
  ORG_ADMIN: "bg-red-500/10 text-red-500 border-red-500/20",
  PLATFORM_ADMIN: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  ORG_ANALYST: "bg-blue-500/10 text-blue-500 border-blue-500/20",
};

const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-500/10 text-green-500 border-green-500/20",
  PENDING: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  SUSPENDED: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

interface PlatformUser {
  id: string;
  full_name: string;
  role: string;
  account_status: string;
  organization_id: string | null;
  org_name?: string;
  created_at: string;
}

const userService = new UserService(new UserRepository());

export default function PlatformUsersPage() {
  const { hasRole, loading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !hasRole(["PLATFORM_ADMIN"])) {
      router.push("/dashboard");
    }
  }, [loading, hasRole, router]);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const platformUsers = await userService.getUsers();
        const orgIds = Array.from(
          new Set(
            platformUsers
              .map((user) => user.organization_id)
              .filter((id): id is string => Boolean(id)),
          ),
        );

        const organizations = orgIds.length
          ? await organizationService.findByIds(orgIds)
          : [];
        const orgMap = Object.fromEntries(
          organizations.map((org) => [org.id, org.name]),
        );

        setUsers(
          platformUsers.map((user) => ({
            ...user,
            org_name: user.organization_id
              ? orgMap[user.organization_id]
              : undefined,
          })),
        );
      } finally {
        setLoadingData(false);
      }
    };
    loadUsers();
  }, []);

  const filtered = users.filter(
    (u) =>
      u.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.role.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  if (!hasRole(["PLATFORM_ADMIN"])) return null;

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
          <UsersIcon className="h-6 w-6 text-primary" />
          All Users
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">View all users across the platform</p>
      </motion.div>

      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or role..."
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
            <UsersIcon className="h-5 w-5" />
            Platform Users ({filtered.length})
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
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Organization</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback>{getInitials(user.full_name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{user.full_name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{user.id.slice(0, 8)}…</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={roleColors[user.role] || ""}>{user.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[user.account_status] || ""}>{user.account_status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.org_name || "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString()}
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
