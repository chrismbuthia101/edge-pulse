"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
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
import { DeviceAssignmentRepository } from "@/lib/repositories/device-assignment-repository";
import { toast } from "sonner";
import type { DeviceAssignment } from "@/lib/repositories/device-assignment-repository";

interface Device {
  id: string;
  name: string;
  type: string;
  status: string;
  ip: string;
  is_active: boolean;
}

interface Analyst {
  user_id: string;
  full_name: string;
  email: string;
  department: string | null;
}

export function DeviceAssignmentManager() {
  const { hasRole, user } = useAuth();
  const [assignments, setAssignments] = useState<DeviceAssignment[]>([]);
  const [unassignedDevices, setUnassignedDevices] = useState<Device[]>([]);
  const [analysts, setAnalysts] = useState<Analyst[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [assignmentStats, setAssignmentStats] = useState({
    totalAssignments: 0,
    activeAssignments: 0,
    unassignedDevices: 0,
    analystsWithAssignments: 0,
  });

  const deviceAssignmentRepository = useMemo(() => new DeviceAssignmentRepository(), []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [assignmentsData, devicesData, analystsData, statsData] = await Promise.all([
        deviceAssignmentRepository.getAllActiveAssignments(),
        deviceAssignmentRepository.getUnassignedDevices(),
        deviceAssignmentRepository.getAnalystsForAssignment(),
        deviceAssignmentRepository.getAssignmentStats(),
      ]);

      setAssignments(assignmentsData);
      setUnassignedDevices(devicesData);
      setAnalysts(analystsData);
      setAssignmentStats(statsData);
    } catch (error) {
      console.error("Failed to load assignment data:", error);
      toast.error("Failed to load device assignments");
    } finally {
      setLoading(false);
    }
  }, [deviceAssignmentRepository]);

  useEffect(() => {
    if (!hasRole(["ADMINISTRATOR"])) return;

    loadData();
  }, [hasRole, loadData]);

  const assignDevice = async (deviceId: string, analystId: string) => {
    if (!user) return;

    try {
      await deviceAssignmentRepository.assignDeviceToAnalyst(
        deviceId,
        analystId,
        user.id
      );
      toast.success("Device assigned successfully");
      await loadData();
    } catch (error) {
      console.error("Failed to assign device:", error);
      toast.error("Failed to assign device");
    }
  };

  const removeAssignment = async (deviceId: string, analystId: string) => {
    if (!user) return;

    try {
      await deviceAssignmentRepository.removeDeviceAssignment(
        deviceId,
        analystId
      );
      toast.success("Device assignment removed");
      await loadData();
    } catch (error) {
      console.error("Failed to remove assignment:", error);
      toast.error("Failed to remove assignment");
    }
  };

  const reassignDevice = async (
    deviceId: string,
    fromAnalystId: string,
    toAnalystId: string
  ) => {
    if (!user) return;

    try {
      await deviceAssignmentRepository.reassignDevice(
        deviceId,
        fromAnalystId,
        toAnalystId,
        user.id
      );
      toast.success("Device reassigned successfully");
      await loadData();
    } catch (error) {
      console.error("Failed to reassign device:", error);
      toast.error("Failed to reassign device");
    }
  };

  const filteredUnassignedDevices = unassignedDevices.filter((device) =>
    device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    device.ip.includes(searchTerm)
  );

  const filteredAssignments = assignments.filter((assignment) =>
    assignment.device_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    assignment.analyst_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!hasRole(["ADMINISTRATOR"])) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold">Access Denied</h3>
          <p className="text-muted-foreground">
            You don&apos;t have permission to manage device assignments.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Total Assignments
                  </p>
                  <p className="text-2xl font-bold">{assignmentStats.totalAssignments}</p>
                </div>
                <MonitorSmartphone className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Active Assignments
                  </p>
                  <p className="text-2xl font-bold text-green-600">
                    {assignmentStats.activeAssignments}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Unassigned Devices
                  </p>
                  <p className="text-2xl font-bold text-orange-600">
                    {assignmentStats.unassignedDevices}
                  </p>
                </div>
                <AlertCircle className="h-8 w-8 text-orange-600" />
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Analysts with Assignments
                  </p>
                  <p className="text-2xl font-bold text-blue-600">
                    {assignmentStats.analystsWithAssignments}
                  </p>
                </div>
                <User className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
        </motion.div>
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
              <Button variant="outline" onClick={loadData}>
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
                  <p className="text-muted-foreground">All devices are assigned</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {filteredUnassignedDevices.map((device) => (
                    <div
                      key={device.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="font-medium">{device.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {device.type} · {device.ip} · {device.status}
                        </div>
                      </div>
                      <Select
                        onValueChange={(analystId) => {
                          if (analystId) assignDevice(device.id, analystId);
                        }}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue placeholder="Assign" />
                        </SelectTrigger>
                        <SelectContent>
                          {analysts.map((analyst) => (
                            <SelectItem key={analyst.user_id} value={analyst.user_id}>
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
                  <p className="text-muted-foreground">No device assignments found</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {filteredAssignments.map((assignment) => (
                    <div
                      key={assignment.assignment_id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="font-medium">{assignment.device_name}</div>
                        <div className="text-sm text-muted-foreground">
                          Assigned to {assignment.analyst_name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {assignment.device_type} · {assignment.device_ip}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Select
                          onValueChange={(newAnalystId) => {
                            if (newAnalystId && newAnalystId !== assignment.analyst_id) {
                              reassignDevice(
                                assignment.device_id,
                                assignment.analyst_id,
                                newAnalystId
                              );
                            }
                          }}
                        >
                          <SelectTrigger className="w-8 h-8 p-0">
                            <ArrowRightLeft className="h-4 w-4" />
                          </SelectTrigger>
                          <SelectContent>
                            {analysts
                              .filter((a) => a.user_id !== assignment.analyst_id)
                              .map((analyst) => (
                                <SelectItem key={analyst.user_id} value={analyst.user_id}>
                                  {analyst.full_name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            removeAssignment(assignment.device_id, assignment.analyst_id)
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
