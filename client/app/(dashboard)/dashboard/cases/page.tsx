"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
    FileText,
    Plus,
    Search,
    Calendar,
    User,
    AlertTriangle,
    CheckCircle,
    Clock,
    ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCaseStore } from "@/lib/stores/case-store";
import { useAuth } from "@/lib/auth/useAuth";

const severityColors = {
    LOW: "bg-green-500/10 text-green-500 border-green-500/20",
    MEDIUM: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    HIGH: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    CRITICAL: "bg-red-500/10 text-red-500 border-red-500/20",
};

const statusColors = {
    OPEN: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    IN_PROGRESS: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    CLOSED: "bg-gray-500/10 text-gray-500 border-gray-500/20",
    ESCALATED: "bg-red-500/10 text-red-500 border-red-500/20",
};

export default function CasesPage() {
    const router = useRouter();
    const { hasRole } = useAuth();
    const { cases, loading, initialize } = useCaseStore();

    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [severityFilter, setSeverityFilter] = useState<string>("all");
    const initializedRef = useRef(false);

    useEffect(() => {
        document.title = "Cases - EdgePulse";
        if (!initializedRef.current) {
            initializedRef.current = true;
            initialize();
        }
    }, [initialize]);

    const filteredCases = useMemo(() => {
        return cases.filter((caseItem) => {
            const matchesSearch =
                caseItem.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (caseItem.description?.toLowerCase() || "").includes(searchTerm.toLowerCase()) ||
                caseItem.case_number.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus = statusFilter === "all" || caseItem.status === statusFilter;
            const matchesSeverity = severityFilter === "all" || caseItem.severity === severityFilter;
            return matchesSearch && matchesStatus && matchesSeverity;
        });
    }, [cases, searchTerm, statusFilter, severityFilter]);

    const handleCreateCase = () => {
        router.push("/dashboard/cases/create");
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case "OPEN":
                return <Clock className="h-4 w-4" />;
            case "IN_PROGRESS":
                return <AlertTriangle className="h-4 w-4" />;
            case "CLOSED":
                return <CheckCircle className="h-4 w-4" />;
            case "ESCALATED":
                return <AlertTriangle className="h-4 w-4" />;
            default:
                return <FileText className="h-4 w-4" />;
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between"
            >
                <div>
                    <h1 className="text-2xl font-display font-bold text-foreground">
                        Incident Cases
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Manage security incident investigations
                    </p>
                </div>
                {hasRole(["ADMINISTRATOR", "ANALYST"]) && (
                    <Button onClick={handleCreateCase} className="gap-2">
                        <Plus className="h-4 w-4" />
                        New Case
                    </Button>
                )}
            </motion.div>

            {/* Filters */}
            <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="flex flex-col sm:flex-row gap-4"
            >
                <div className="flex-1">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search cases..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </div>
                <Tabs value={statusFilter} onValueChange={setStatusFilter} className="w-full sm:w-auto">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="all">All</TabsTrigger>
                        <TabsTrigger value="OPEN">Open</TabsTrigger>
                        <TabsTrigger value="IN_PROGRESS">In Progress</TabsTrigger>
                        <TabsTrigger value="CLOSED">Closed</TabsTrigger>
                    </TabsList>
                </Tabs>
                <Tabs value={severityFilter} onValueChange={setSeverityFilter} className="w-full sm:w-auto">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="all">All</TabsTrigger>
                        <TabsTrigger value="CRITICAL">Critical</TabsTrigger>
                        <TabsTrigger value="HIGH">High</TabsTrigger>
                        <TabsTrigger value="MEDIUM">Medium</TabsTrigger>
                    </TabsList>
                </Tabs>
            </motion.div>

            {/* Cases List */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="space-y-4"
            >
                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                        <p className="text-muted-foreground">Loading cases...</p>
                    </div>
                ) : filteredCases.length === 0 ? (
                    <Card>
                        <CardContent className="flex flex-col items-center justify-center py-12">
                            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                            <h3 className="text-lg font-semibold text-foreground mb-2">
                                No cases found
                            </h3>
                            <p className="text-sm text-muted-foreground text-center mb-4">
                                {searchTerm || statusFilter !== "all" || severityFilter !== "all"
                                    ? "Try adjusting your search or filters"
                                    : "Get started by creating your first incident case"}
                            </p>
                            {hasRole(["ADMINISTRATOR", "ANALYST"]) && (
                                <Button onClick={handleCreateCase} variant="outline">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Create Case
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                ) : (
                    filteredCases.map((case_, index) => (
                        <motion.div
                            key={case_.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 + index * 0.05 }}
                        >
                            <Card className="hover:shadow-md transition-shadow cursor-pointer"
                                onClick={() => router.push(`/dashboard/cases/${case_.id}`)}>
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Badge className={severityColors[case_.severity]}>
                                                    {case_.severity}
                                                </Badge>
                                                <Badge className={statusColors[case_.status]} variant="outline">
                                                    <span className="flex items-center gap-1">
                                                        {getStatusIcon(case_.status)}
                                                        {case_.status.replace("_", " ")}
                                                    </span>
                                                </Badge>
                                            </div>
                                            <CardTitle className="text-lg mb-1">
                                                {case_.title}
                                            </CardTitle>
                                            <p className="text-sm text-muted-foreground line-clamp-2">
                                                {case_.description}
                                            </p>
                                        </div>
                                        <ArrowRight className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <div className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-4 text-muted-foreground">
                                            <div className="flex items-center gap-1">
                                                <FileText className="h-3 w-3" />
                                                <span>{case_.alert_count} alerts</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <User className="h-3 w-3" />
                                                <span>{case_.assigned_to}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 text-muted-foreground">
                                            <Calendar className="h-3 w-3" />
                                            <span>{new Date(case_.last_activity).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    ))
                )}
            </motion.div>
        </div>
    );
}
