"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
    Users, Shield, Download, RefreshCw, Search,
    UserCheck, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useUserStore } from "@/lib/stores/user-store";
import { useAuth } from "@/lib/auth/useAuth";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const roleColors: Record<string, string> = {
    ORG_ADMIN: "bg-red-500/10 text-red-500 border-red-500/20",
    PLATFORM_ADMIN: "bg-red-500/10 text-red-500 border-red-500/20",
    ORG_ANALYST: "bg-blue-500/10 text-blue-500 border-blue-500/20",
};

const statusColors: Record<string, string> = {
    active: "bg-green-500/10 text-green-500 border-green-500/20",
    inactive: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

export default function UserManagementReport() {
    const { hasRole, loading: authLoading } = useAuth();
    const router = useRouter();
    const {
        users,
        loading,
        searchTerm,
        filterRole,
        filterStatus,
        initialize,
        setSearchTerm,
        setFilterRole,
        setFilterStatus,
    } = useUserStore();
    const [refreshing, setRefreshing] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

    useEffect(() => {
        if (!authLoading && !hasRole(["ORG_ADMIN"])) {
            router.push("/dashboard/reports");
        }
    }, [authLoading, hasRole, router]);

    useEffect(() => {
        if (hasRole(["ORG_ADMIN"])) {
            initialize();
        }
    }, [initialize, hasRole]);

    const filteredUsers = users.filter((user) => {
        const matchesSearch =
            !searchTerm ||
            user.full_name.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesRole = filterRole === "all" || user.role === filterRole;
        const matchesStatus =
            filterStatus === "all" ||
            (filterStatus === "active" && user.account_status === "ACTIVE") ||
            (filterStatus === "inactive" && user.account_status !== "ACTIVE");

        return matchesSearch && matchesRole && matchesStatus;
    });

    const stats = [
        {
            label: "Total Users",
            value: users.length.toString(),
            color: "text-primary",
            bg: "bg-primary/5",
            border: "border-primary/20",
            icon: Users,
        },
        {
            label: "Active Users",
            value: users.filter(u => u.account_status === "ACTIVE").length.toString(),
            color: "text-green-500",
            bg: "bg-green-500/5",
            border: "border-green-500/20",
            icon: UserCheck,
        },
        {
            label: "Administrators",
            value: users.filter(u => u.role === "ORG_ADMIN" || u.role === "PLATFORM_ADMIN").length.toString(),
            color: "text-red-500",
            bg: "bg-red-500/5",
            border: "border-red-500/20",
            icon: Shield,
        },
        {
            label: "Analysts",
            value: users.filter(u => u.role === "ORG_ANALYST").length.toString(),
            color: "text-blue-500",
            bg: "bg-blue-500/5",
            border: "border-blue-500/20",
            icon: Users,
        },
    ];

    const handleRefresh = async () => {
        setRefreshing(true);
        await initialize();
        setLastUpdated(new Date());
        setRefreshing(false);
    };

    const exportReport = () => {
        const doc = new jsPDF();

        // Title
        doc.setFontSize(20);
        doc.setTextColor(59, 130, 246);
        doc.text("EdgePulse User Management Report", 14, 20);

        // Metadata
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
        doc.text(`Last Updated: ${lastUpdated.toLocaleString()}`, 14, 34);

        // Summary Section
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text("Summary", 14, 45);

        doc.setFontSize(10);
        doc.setTextColor(60);
        const summaryData = [
            ["Total Users", users.length.toString()],
            ["Active Users", users.filter(u => u.account_status === "ACTIVE").length.toString()],
            ["Administrators", users.filter(u => u.role === "ORG_ADMIN" || u.role === "PLATFORM_ADMIN").length.toString()],
            ["Analysts", users.filter(u => u.role === "ORG_ANALYST").length.toString()],
            ["Pending", users.filter(u => u.account_status === "PENDING").length.toString()],
            ["Suspended", users.filter(u => u.account_status === "SUSPENDED").length.toString()],
        ];

        autoTable(doc, {
            startY: 50,
            head: [["Metric", "Count"]],
            body: summaryData,
            theme: "grid",
            headStyles: { fillColor: [59, 130, 246] },
            styles: { fontSize: 9 },
        });

        // User List Section
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text("User List", 14, 115);

        const userData = filteredUsers.map(u => [
            u.full_name,
            u.role,
            u.account_status === "ACTIVE" ? "Active" : u.account_status === "PENDING" ? "Pending" : "Suspended",
            new Date(u.created_at).toLocaleDateString(),
        ]);

        autoTable(doc, {
            startY: 120,
            head: [["Name", "Role", "Status", "Created"]],
            body: userData,
            theme: "grid",
            headStyles: { fillColor: [59, 130, 246] },
            styles: { fontSize: 8 },
            columnStyles: {
                0: { cellWidth: 50 },
                1: { cellWidth: 30 },
                2: { cellWidth: 25 },
                3: { cellWidth: 30 },
            },
        });

        doc.save(`user-management-report-${new Date().toISOString().split("T")[0]}.pdf`);
    };

    const getInitials = (name: string) =>
        name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

    return (
        <div className="max-w-300 space-y-6">
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between">
                <div>
                    <h1 className="text-2xl font-display font-bold text-foreground">User Management Report</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Comprehensive overview of all users and their status
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={handleRefresh} disabled={refreshing}>
                        {refreshing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Refresh
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 gap-1.5" onClick={exportReport}>
                        <Download className="h-3.5 w-3.5" />
                        Export
                    </Button>
                    <Badge variant="outline" className="gap-1.5 text-xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        Admin Only
                    </Badge>
                </div>
            </motion.div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {stats.map((stat, i) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.06 }}
                        className={cn("border rounded-xl p-4 relative overflow-hidden", stat.bg, stat.border)}
                    >
                        <div className={cn("absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-10", stat.color.replace("text-", "bg-"))} />
                        <div className="flex items-start justify-between relative">
                            <p className={`text-2xl font-bold font-display ${stat.color}`}>{stat.value}</p>
                            <stat.icon className={cn("h-4 w-4", stat.color)} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 relative">{stat.label}</p>
                    </motion.div>
                ))}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.32 }}
                    className="bg-card border border-border rounded-xl p-4 flex items-center justify-between"
                >
                    <div>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Last updated
                        </p>
                        <p className="text-xs font-medium text-foreground mt-0.5">
                            {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>
                </motion.div>
            </div>

            {/* Filters */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                className="bg-card border border-border rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                    <Search className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filter Users</span>
                </div>
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by name or email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        <select value={filterRole} onChange={(e) => setFilterRole(e.target.value as import("@/lib/types/shared").UserRole | "all") } className="px-3 py-2 border rounded-md bg-background text-sm">
                            <option value="all">All Roles</option>
                            <option value="ORG_ADMIN">Administrators</option>
                            <option value="ORG_ANALYST">Analysts</option>
                        </select>
                        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as "all" | "active" | "inactive") } className="px-3 py-2 border rounded-md bg-background text-sm">
                            <option value="all">All Status</option>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </div>
                </div>
            </motion.div>

            {/* User Table */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5" />Users ({filteredUsers.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loading ? (
                            <div className="flex items-center justify-center h-32">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                            </div>
                        ) : filteredUsers.length === 0 ? (
                            <div className="text-center py-8">
                                <Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                                <p className="text-muted-foreground">No users found</p>
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>User</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Created</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredUsers.map((user) => (
                                        <TableRow key={user.id}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <Avatar>
                                                        <AvatarFallback>
                                                            {getInitials(user.full_name)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <div className="font-medium">{user.full_name}</div>
                                                        <div className="text-xs text-muted-foreground font-mono">
                                                            {user.id.slice(0, 8)}…
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={roleColors[user.role]}>{user.role}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={
                                                    user.account_status === "ACTIVE"
                                                        ? statusColors.active
                                                        : statusColors.inactive
                                                }>
                                                    {user.account_status === "ACTIVE" ? "Active" : user.account_status === "PENDING" ? "Pending" : "Suspended"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {new Date(user.created_at).toLocaleDateString()}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
}


