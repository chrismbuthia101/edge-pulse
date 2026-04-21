"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
    Users, UserPlus, Search, MoreHorizontal, Shield,
    CheckCircle, XCircle, Edit, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    Dialog, DialogContent, DialogDescription, DialogFooter,
    DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useUserStore } from "@/stores/user-store";
import { useAuth } from "@/lib/auth/useAuth";

const roleColors: Record<string, string> = {
    ADMINISTRATOR: "bg-red-500/10 text-red-500 border-red-500/20",
    ANALYST: "bg-blue-500/10 text-blue-500 border-blue-500/20",
};

const statusColors: Record<string, string> = {
    active: "bg-green-500/10 text-green-500 border-green-500/20",
    inactive: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

export default function UsersPage() {
    const { user: currentUser, hasRole } = useAuth();
    const {
        users,
        pendingUsers,
        loading,
        searchTerm,
        filterRole,
        filterStatus,
        filterApprovalStatus,
        initialize,
        refreshPendingUsers,
        setSearchTerm,
        setFilterRole,
        setFilterStatus,
        setFilterApprovalStatus,
        toggleUserStatus,
        approveUser,
        rejectUser,
        reapproveUser
    } = useUserStore();
    const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [rejectionReason, setRejectionReason] = useState("");

    useEffect(() => {
        initialize();
        if (hasRole(["ADMINISTRATOR"])) {
            refreshPendingUsers();
        }
    }, [initialize, refreshPendingUsers, hasRole]);

    if (!hasRole(["ADMINISTRATOR"])) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-center">
                    <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold">Access Denied</h3>
                    <p className="text-muted-foreground">You don&apos;t have permission to access this page.</p>
                </div>
            </div>
        );
    }

    const filteredUsers = users.filter((user) => {
        const matchesSearch =
            !searchTerm ||
            user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.department?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesRole = filterRole === "all" || user.role === filterRole;
        const matchesStatus =
            filterStatus === "all" ||
            (filterStatus === "active" && user.is_active) ||
            (filterStatus === "inactive" && !user.is_active);
        const matchesApproval =
            filterApprovalStatus === "all" ||
            user.approval_status === filterApprovalStatus;

        return matchesSearch && matchesRole && matchesStatus && matchesApproval;
    });

    const getInitials = (name: string) =>
        name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

    return (
        <div className="space-y-6">
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-display font-bold text-foreground">User Management</h1>
                    <p className="text-muted-foreground">Manage analyst users and permissions</p>
                </div>
                <Button>
                    <UserPlus className="h-4 w-4 mr-2" />Add User
                </Button>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex flex-col sm:flex-row gap-4">
                            <div className="flex-1">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search by name or department..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-10"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="px-3 py-2 border rounded-md bg-background text-sm">
                                    <option value="all">All Roles</option>
                                    <option value="ADMINISTRATOR">Administrators</option>
                                    <option value="ANALYST">Analysts</option>
                                </select>
                                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="px-3 py-2 border rounded-md bg-background text-sm">
                                    <option value="all">All Status</option>
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                                <select value={filterApprovalStatus} onChange={(e) => setFilterApprovalStatus(e.target.value)} className="px-3 py-2 border rounded-md bg-background text-sm">
                                    <option value="all">All Approval</option>
                                    <option value="PENDING">Pending</option>
                                    <option value="APPROVED">Approved</option>
                                    <option value="REJECTED">Rejected</option>
                                </select>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Pending Approvals Section */}
            {pendingUsers.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                    <Card className="border-orange-200 bg-orange-50/50 dark:bg-orange-950/20 dark:border-orange-800/50">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-orange-800 dark:text-orange-300">
                                <UserPlus className="h-5 w-5" />
                                Pending User Approvals ({pendingUsers.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {pendingUsers.map((user) => (
                                    <div key={user.user_id} className="flex items-center justify-between p-4 border border-orange-200 rounded-lg bg-white dark:bg-orange-950/30 dark:border-orange-800/30">
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-orange-900 dark:text-orange-200 truncate">{user.full_name}</div>
                                            {/* user.email doesn't exist in analyst_users — omit it */}
                                            <div className="text-xs text-orange-600 dark:text-orange-400">
                                                Applied {new Date(user.created_at).toLocaleDateString()} · {user.department || "No department"}
                                            </div>
                                        </div>
                                        <div className="flex gap-2 shrink-0">
                                            <Button
                                                size="sm"
                                                onClick={() => approveUser(user.user_id)}
                                                className="bg-green-600 hover:bg-green-700"
                                            >
                                                Approve as Analyst
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={() => {
                                                    setSelectedUserId(user.user_id);
                                                    setRejectionReason("");
                                                    setRejectDialogOpen(true);
                                                }}
                                            >
                                                Reject
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            )}

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
                                        <TableHead>Department</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Approval</TableHead>
                                        <TableHead>Created</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredUsers.map((user) => (
                                        <TableRow key={user.user_id}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <Avatar>
                                                        {/* No AvatarImage since we have no email/avatar URL */}
                                                        <AvatarFallback>
                                                            {getInitials(user.full_name)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <div className="font-medium">{user.full_name}</div>
                                                        {/* Show user_id truncated instead of email */}
                                                        <div className="text-xs text-muted-foreground font-mono">
                                                            {user.user_id.slice(0, 8)}…
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={roleColors[user.role]}>{user.role}</Badge>
                                            </TableCell>
                                            <TableCell>{user.department || "—"}</TableCell>
                                            <TableCell>
                                                <Badge className={statusColors[user.is_active ? "active" : "inactive"]}>
                                                    {user.is_active ? "Active" : "Inactive"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={
                                                    user.approval_status === "APPROVED"
                                                        ? "bg-green-500/10 text-green-500 border-green-500/20"
                                                        : user.approval_status === "PENDING"
                                                            ? "bg-orange-500/10 text-orange-500 border-orange-500/20"
                                                            : "bg-red-500/10 text-red-500 border-red-500/20"
                                                }>
                                                    {user.approval_status || "UNKNOWN"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {new Date(user.created_at).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="sm">
                                                            <MoreHorizontal className="h-4 w-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem>
                                                            <Edit className="h-4 w-4 mr-2" />Edit User
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            onClick={() => toggleUserStatus(user.user_id, user.is_active)}
                                                        >
                                                            {user.is_active
                                                                ? <><XCircle className="h-4 w-4 mr-2" />Deactivate</>
                                                                : <><CheckCircle className="h-4 w-4 mr-2" />Activate</>
                                                            }
                                                        </DropdownMenuItem>
                                                        {user.approval_status === "REJECTED" && (
                                                            <DropdownMenuItem
                                                                onClick={() => reapproveUser(user.user_id)}
                                                            >
                                                                <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                                                                Reapprove User
                                                            </DropdownMenuItem>
                                                        )}
                                                        {user.user_id !== currentUser?.id && (
                                                            <>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem className="text-destructive">
                                                                    <Trash2 className="h-4 w-4 mr-2" />Delete User
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </motion.div>

            {/* Rejection Reason Dialog */}
            <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Reject User</DialogTitle>
                        <DialogDescription>
                            Please provide a reason for rejecting this user.
                        </DialogDescription>
                    </DialogHeader>
                    <Textarea
                        placeholder="Enter rejection reason..."
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        rows={4}
                    />
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setRejectDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => {
                                if (selectedUserId) {
                                    rejectUser(selectedUserId, rejectionReason || "No reason provided");
                                }
                                setRejectDialogOpen(false);
                                setSelectedUserId(null);
                                setRejectionReason("");
                            }}
                        >
                            Reject User
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}