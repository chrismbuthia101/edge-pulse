"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, AlertTriangle, User, Calendar, CheckCircle, MessageSquare, Plus, Save, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/useAuth";
import { toast } from "sonner";

interface IncidentCase {
    case_id: string;
    case_number: string;
    title: string;
    description: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    status: "OPEN" | "IN_PROGRESS" | "CLOSED" | "ESCALATED";
    assigned_to: string;
    created_by: string;
    created_at: string;
    updated_at: string;
}

interface AlertLink {
    alert_id: string;
    alert_severity: string;
    alert_status: string;
    device_id: string;
    created_at: string;
    explanation_json: any;
}

interface CaseNote {
    note_id: string;
    case_id: string;
    content: string;
    created_by: string;
    created_at: string;
}

const severityColors: Record<string, string> = {
    LOW: "bg-green-500/10 text-green-500 border-green-500/20",
    MEDIUM: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    HIGH: "bg-orange-500/10 text-orange-500 border-orange-500/20",
    CRITICAL: "bg-red-500/10 text-red-500 border-red-500/20",
};

const statusColors: Record<string, string> = {
    OPEN: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    IN_PROGRESS: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    CLOSED: "bg-gray-500/10 text-gray-500 border-gray-500/20",
    ESCALATED: "bg-red-500/10 text-red-500 border-red-500/20",
};

export default function CaseDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { user, hasRole } = useAuth();
    const supabase = createClient();

    const [caseData, setCaseData] = useState<IncidentCase | null>(null);
    const [alerts, setAlerts] = useState<AlertLink[]>([]);
    const [notes, setNotes] = useState<CaseNote[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [newNote, setNewNote] = useState("");
    const [saving, setSaving] = useState(false);

    const [editTitle, setEditTitle] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [editStatus, setEditStatus] = useState("");
    const [editAssignedTo, setEditAssignedTo] = useState("");

    const caseId = params.case_id as string;

    useEffect(() => {
        if (caseId) {
            fetchCase();
            fetchAlerts();
            fetchNotes();
        }
    }, [caseId]);

    const fetchCase = async () => {
        try {
            const { data, error } = await supabase
                .from("incident_cases")
                .select("*")
                .eq("case_id", caseId)
                .single();

            if (error) throw error;

            setCaseData(data);
            setEditTitle(data.title);
            setEditDescription(data.description);
            setEditStatus(data.status);
            setEditAssignedTo(data.assigned_to);
        } catch (error) {
            console.error("Failed to fetch case:", error);
            toast.error("Failed to load case");
        }
    };

    const fetchAlerts = async () => {
        try {
            const { data, error } = await supabase
                .from("case_alerts")
                .select(`alert_id, alert_records!inner(alert_severity, alert_status, device_id, created_at, explanation_json)`)
                .eq("case_id", caseId);

            if (error) throw error;

            const transformedAlerts: AlertLink[] = (data || []).map((item: any) => ({
                alert_id: item.alert_id,
                alert_severity: item.alert_records.alert_severity,
                alert_status: item.alert_records.alert_status,
                device_id: item.alert_records.device_id,
                created_at: item.alert_records.created_at,
                explanation_json: item.alert_records.explanation_json,
            }));

            setAlerts(transformedAlerts);
        } catch (error) {
            console.error("Failed to fetch alerts:", error);
        }
    };

    const fetchNotes = async () => {
        try {
            const { data, error } = await supabase
                .from("case_notes")
                .select("*")
                .eq("case_id", caseId)
                .order("created_at", { ascending: false });

            if (error) throw error;

            setNotes(data || []);
        } catch (error) {
            console.error("Failed to fetch notes:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveCase = async () => {
        try {
            setSaving(true);
            const { error } = await supabase
                .from("incident_cases")
                .update({
                    title: editTitle,
                    description: editDescription,
                    status: editStatus,
                    assigned_to: editAssignedTo,
                    updated_at: new Date().toISOString(),
                })
                .eq("case_id", caseId);

            if (error) throw error;
            toast.success("Case updated successfully");
            setEditing(false);
            fetchCase();
        } catch (error) {
            console.error("Failed to update case:", error);
            toast.error("Failed to update case");
        } finally {
            setSaving(false);
        }
    };

    const handleAddNote = async () => {
        if (!newNote.trim()) return;
        try {
            const { error } = await supabase
                .from("case_notes")
                .insert({ case_id: caseId, content: newNote.trim(), created_by: user?.id });

            if (error) throw error;
            toast.success("Note added successfully");
            setNewNote("");
            fetchNotes();
        } catch (error) {
            console.error("Failed to add note:", error);
            toast.error("Failed to add note");
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!caseData) {
        return (
            <div className="text-center py-12">
                <h3 className="text-lg font-semibold text-foreground mb-2">Case not found</h3>
                <Button onClick={() => router.back()} variant="outline">
                    <ArrowLeft className="h-4 w-4 mr-2" />Go Back
                </Button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="sm" onClick={() => router.back()} className="gap-2">
                        <ArrowLeft className="h-4 w-4" />Back to Cases
                    </Button>
                    <div>
                        <h1 className="text-2xl font-display font-bold text-foreground">
                            {editing ? (
                                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="text-2xl font-display font-bold h-auto py-2" />
                            ) : caseData.title}
                        </h1>
                        <p className="text-sm text-muted-foreground mt-0.5">Case {caseData.case_number}</p>
                    </div>
                </div>
                {hasRole(["ADMINISTRATOR", "ANALYST"]) && (
                    <div className="flex items-center gap-2">
                        {editing ? (
                            <>
                                <Button variant="outline" onClick={() => {
                                    setEditing(false);
                                    setEditTitle(caseData.title);
                                    setEditDescription(caseData.description);
                                    setEditStatus(caseData.status);
                                    setEditAssignedTo(caseData.assigned_to);
                                }}>Cancel</Button>
                                <Button onClick={handleSaveCase} disabled={saving}>
                                    <Save className="h-4 w-4 mr-2" />{saving ? "Saving..." : "Save"}
                                </Button>
                            </>
                        ) : (
                            <Button variant="outline" onClick={() => setEditing(true)}>
                                <Edit className="h-4 w-4 mr-2" />Edit Case
                            </Button>
                        )}
                    </div>
                )}
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <Card>
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Badge className={severityColors[caseData.severity]}>{caseData.severity}</Badge>
                                <Badge className={statusColors[caseData.status]} variant="outline">
                                    {caseData.status.replace("_", " ")}
                                </Badge>
                            </div>
                            {editing && (
                                <Select value={editStatus} onValueChange={setEditStatus}>
                                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="OPEN">Open</SelectItem>
                                        <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                                        <SelectItem value="CLOSED">Closed</SelectItem>
                                        <SelectItem value="ESCALATED">Escalated</SelectItem>
                                    </SelectContent>
                                </Select>
                            )}
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {editing ? (
                            <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="Case description..." className="min-h-32" />
                        ) : (
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{caseData.description}</p>
                        )}
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <Label className="text-xs text-muted-foreground">Assigned To</Label>
                                {editing ? (
                                    <Input value={editAssignedTo} onChange={(e) => setEditAssignedTo(e.target.value)} placeholder="Assign to analyst..." />
                                ) : (
                                    <p className="font-medium">{caseData.assigned_to}</p>
                                )}
                            </div>
                            <div>
                                <Label className="text-xs text-muted-foreground">Created By</Label>
                                <p className="font-medium">{caseData.created_by}</p>
                            </div>
                            <div>
                                <Label className="text-xs text-muted-foreground">Created</Label>
                                <p className="font-medium">{new Date(caseData.created_at).toLocaleString()}</p>
                            </div>
                            <div>
                                <Label className="text-xs text-muted-foreground">Last Updated</Label>
                                <p className="font-medium">{new Date(caseData.updated_at).toLocaleString()}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <Tabs defaultValue="alerts" className="space-y-4">
                    <TabsList>
                        <TabsTrigger value="alerts">Alerts ({alerts.length})</TabsTrigger>
                        <TabsTrigger value="notes">Notes ({notes.length})</TabsTrigger>
                    </TabsList>

                    <TabsContent value="alerts" className="space-y-4">
                        {alerts.length === 0 ? (
                            <Card>
                                <CardContent className="flex flex-col items-center justify-center py-8">
                                    <AlertTriangle className="h-8 w-8 text-muted-foreground mb-2" />
                                    <p className="text-sm text-muted-foreground">No alerts linked to this case</p>
                                </CardContent>
                            </Card>
                        ) : (
                            alerts.map((alert) => (
                                <Card key={alert.alert_id}>
                                    <CardHeader className="pb-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Badge className={severityColors[alert.alert_severity] || ""}>{alert.alert_severity}</Badge>
                                                <span className="text-sm text-muted-foreground">Device: {alert.device_id}</span>
                                            </div>
                                            <span className="text-xs text-muted-foreground">{new Date(alert.created_at).toLocaleString()}</span>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/alerts/${alert.alert_id}`)}>
                                            View Alert Details
                                        </Button>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </TabsContent>

                    <TabsContent value="notes" className="space-y-4">
                        {hasRole(["ADMINISTRATOR", "ANALYST"]) && (
                            <Card>
                                <CardHeader><CardTitle className="text-lg">Add Note</CardTitle></CardHeader>
                                <CardContent className="space-y-4">
                                    <Textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a note about this case..." className="min-h-24" />
                                    <Button onClick={handleAddNote} disabled={!newNote.trim()}>
                                        <Plus className="h-4 w-4 mr-2" />Add Note
                                    </Button>
                                </CardContent>
                            </Card>
                        )}
                        {notes.length === 0 ? (
                            <Card>
                                <CardContent className="flex flex-col items-center justify-center py-8">
                                    <MessageSquare className="h-8 w-8 text-muted-foreground mb-2" />
                                    <p className="text-sm text-muted-foreground">No notes yet</p>
                                </CardContent>
                            </Card>
                        ) : (
                            notes.map((note) => (
                                <Card key={note.note_id}>
                                    <CardContent className="pt-6">
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <span className="font-medium">{note.created_by}</span>
                                                <span className="text-xs text-muted-foreground">{new Date(note.created_at).toLocaleString()}</span>
                                            </div>
                                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{note.content}</p>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </TabsContent>
                </Tabs>
            </motion.div>
        </div>
    );
}