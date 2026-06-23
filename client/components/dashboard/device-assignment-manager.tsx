"use client";

import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import {
  MonitorSmartphone,
  User,
  Search,
  Filter,
  ArrowRightLeft,
  Trash2,
  CheckCircle,
  AlertCircle,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth/useAuth";
import { useDeviceAssignmentStore } from "@/lib/stores/device-assignment-store";

export function DeviceAssignmentManager() {
  const { hasRole, user } = useAuth();
  const assignments = useDeviceAssignmentStore((s) => s.assignments);
  const unassignedDevices = useDeviceAssignmentStore((s) => s.unassignedDevices);
  const analysts = useDeviceAssignmentStore((s) => s.analysts);
  const assignmentStats = useDeviceAssignmentStore((s) => s.assignmentStats);
  const loading = useDeviceAssignmentStore((s) => s.loading);
  const loadData = useDeviceAssignmentStore((s) => s.loadData);
  const assignDevice = useDeviceAssignmentStore((s) => s.assignDevice);
  const removeAssignment = useDeviceAssignmentStore((s) => s.removeAssignment);
  const reassignDevice = useDeviceAssignmentStore((s) => s.reassignDevice);
  const [searchTerm, setSearchTerm] = useState("");

  const loadDataCallback = useCallback(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!hasRole(["ORG_ADMIN"])) return;
    loadDataCallback();
  }, [hasRole, loadDataCallback]);

  if (!hasRole(["ORG_ADMIN"])) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold">Access Denied</h3>
          <p className="text-muted-foreground">
            You don&apos;t have permission to access device assignments.
          </p>
        </div>
      </div>
    );
  }

  const handleAssign = (deviceId: string, analystId: string) => {
    if (!user) return;
    assignDevice(deviceId, analystId, user.id);
  };

  const handleRemove = (deviceId: string, analystId: string) => {
    removeAssignment(deviceId, analystId);
  };

  const handleReassign = (
    deviceId: string,
    fromAnalystId: string,
    toAnalystId: string,
  ) => {
    if (!user) return;
    reassignDevice(deviceId, fromAnalystId, toAnalystId, user.id);
  };

  const filteredUnassignedDevices = unassignedDevices.filter(
    (device) =>
      device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.ip?.includes(searchTerm),
  );

  const filteredAssignments = assignments.filter(
    (assignment) =>
      assignment.device_name
        ?.toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      assignment.user_name?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const stats = assignmentStats ?? {
    totalAssignments: 0,
    activeAssignments: 0,
    unassignedDevices: 0,
    usersWithAssignments: 0,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

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
            Device Assignment Management
          </h1>
          <p className="text-muted-foreground">
            Manage device assignments to security analysts
          </p>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Total Assignments",
            value: stats.totalAssignments,
            icon: MonitorSmartphone,
            color: "text-foreground",
          },
          {
            label: "Active Assignments",
            value: stats.activeAssignments,
            icon: CheckCircle,
            color: "text-green-600",
          },
          {
            label: "Unassigned Devices",
            value: stats.unassignedDevices,
            icon: AlertCircle,
            color: "text-orange-600",
          },
          {
            label: "Users with Assignments",
            value: stats.usersWithAssignments,
            icon: User,
            color: "text-blue-600",
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {stat.label}
                    </p>
                    <p className={`text-2xl font-bold ${stat.color}`}>
                      {stat.value}
                    </p>
                  </div>
                  <stat.icon className={`h-8 w-8 ${stat.color}`} />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Search Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search devices or analysts..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Button variant="outline" onClick={loadDataCallback}>
                <Filter className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Unassigned Devices */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MonitorSmartphone className="h-5 w-5" />
                Unassigned Devices ({filteredUnassignedDevices.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredUnassignedDevices.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                  <p className="text-muted-foreground">
                    All devices are assigned
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {filteredUnassignedDevices.map((device) => (
                    <div
                      key={device.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {device.name}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {device.type} · {device.ip || "—"} · {device.status}
                        </div>
                      </div>
                      <Select
                        onValueChange={(analystId) => {
                          if (analystId) handleAssign(device.id, analystId);
                        }}
                      >
                        <SelectTrigger className="w-36 shrink-0">
                          <SelectValue placeholder="Assign to…" />
                        </SelectTrigger>
                        <SelectContent>
                          {analysts.map((analyst) => (
                            <SelectItem key={analyst.id} value={analyst.id}>
                              {analyst.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Current Assignments */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.7 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Current Assignments ({filteredAssignments.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredAssignments.length === 0 ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">
                    No device assignments found
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {filteredAssignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {assignment.device_name}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          Assigned to{" "}
                          {assignment.user_name || "Unknown analyst"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {assignment.device_type} ·{" "}
                          {assignment.device_ip || "—"}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Select
                          onValueChange={(newAnalystId) => {
                            if (
                              newAnalystId &&
                              newAnalystId !== assignment.user_id
                            ) {
                              handleReassign(
                                assignment.device_id,
                                assignment.user_id,
                                newAnalystId,
                              );
                            }
                          }}
                        >
                          <SelectTrigger className="w-8 h-8 p-0">
                            <ArrowRightLeft className="h-4 w-4" />
                          </SelectTrigger>
                          <SelectContent>
                            {analysts
                              .filter((a) => a.id !== assignment.user_id)
                              .map((analyst) => (
                                <SelectItem key={analyst.id} value={analyst.id}>
                                  {analyst.full_name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            handleRemove(
                              assignment.device_id,
                              assignment.user_id,
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
