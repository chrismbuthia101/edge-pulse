"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Network,
  AlertTriangle,
  Monitor,
  Server,
  Wifi,
  Activity,
} from "lucide-react";
import { useDeviceStore } from "@/lib/stores/device-store";
import { useDeviceAssignmentStore } from "@/lib/stores/device-assignment-store";

interface NetworkNode {
  id: string;
  name: string;
  type: "server" | "workstation" | "mobile" | "iot";
  status: "online" | "offline" | "warning";
  x: number;
  y: number;
  connections: string[];
  anomalyLevel: "low" | "medium" | "high" | "critical";
  lastSeen: string;
}

interface NetworkConnection {
  source: string;
  target: string;
  strength: number;
  encrypted: boolean;
}

function deriveNodeType(deviceType: string): NetworkNode["type"] {
  const t = deviceType.toLowerCase();
  if (t.includes("server") || t === "server") return "server";
  if (t.includes("mobile") || t === "mobile") return "mobile";
  if (t.includes("iot") || t === "iot") return "iot";
  return "workstation";
}

function deriveAnomalyLevel(risk: string, status: string): NetworkNode["anomalyLevel"] {
  if (risk === "critical") return "critical";
  if (risk === "high") return "high";
  if (risk === "medium") return "medium";
  if (risk === "low" || status === "offline") return "low";
  return "low";
}

function layoutNodes(count: number, width: number, height: number): { x: number; y: number }[] {
  const positions: { x: number; y: number }[] = [];
  const centerX = width / 2;
  const centerY = height / 2;
  if (count === 0) return positions;
  if (count === 1) return [{ x: centerX, y: centerY }];

  const radius = Math.min(width, height) * 0.35;
  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    positions.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  }
  return positions;
}

export function NetworkTopology() {
  const devices = useDeviceStore((s) => s.devices);
  const assignments = useDeviceAssignmentStore((s) => s.assignments);
  const loadData = useDeviceAssignmentStore((s) => s.loadData);
  const refreshDevices = useDeviceStore((s) => s.refreshDevices);
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    refreshDevices();
    loadData();
  }, [refreshDevices, loadData]);

  const { nodes, connections } = useMemo(() => {
    const result: NetworkNode[] = [];
    const conns: NetworkConnection[] = [];
    const positions = layoutNodes(devices.length, 800, 500);

    devices.forEach((device, i) => {
      const pos = positions[i] ?? { x: 400 + ((i * 137) % 200), y: 250 + ((i * 89) % 200) };
      const status = device.status === "online" ? "online"
        : device.status === "gone_silent" ? "warning"
        : "offline";

      result.push({
        id: device.id,
        name: device.name,
        type: deriveNodeType(device.type),
        status,
        x: pos.x,
        y: pos.y,
        connections: [],
        anomalyLevel: deriveAnomalyLevel(device.risk, device.status),
        lastSeen: device.last_seen
          ? (() => {
              const diffMins = Math.floor(
                (new Date().getTime() - new Date(device.last_seen).getTime()) / 60000,
              );
              if (diffMins < 1) return "Active now";
              if (diffMins < 60) return `${diffMins}m ago`;
              return `${Math.floor(diffMins / 60)}h ago`;
            })()
          : "Never",
      });
    });

    const deviceMap = new Map(devices.map((d) => [d.id, true]));
    assignments.forEach((assn) => {
      if (deviceMap.has(assn.device_id)) {
        const targetId = assn.user_id;
        conns.push({
          source: assn.device_id,
          target: targetId,
          strength: 0.8,
          encrypted: true,
        });
      }
    });

    return { nodes: result, connections: conns };
  }, [devices, assignments]);

  const getNodeIcon = (type: string) => {
    switch (type) {
      case "server":
        return Server;
      case "workstation":
        return Monitor;
      case "mobile":
        return Wifi;
      default:
        return Monitor;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "online":
        return "#10b981";
      case "offline":
        return "#ef4444";
      case "warning":
        return "#f59e0b";
      default:
        return "#6b7280";
    }
  };

  const getAnomalyColor = (level: string) => {
    switch (level) {
      case "critical":
        return "#dc2626";
      case "high":
        return "#ea580c";
      case "medium":
        return "#d97706";
      case "low":
        return "#65a30d";
      default:
        return "#6b7280";
    }
  };

  if (nodes.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Network Topology
            </h3>
          </div>
        </div>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground text-sm">No devices to display</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">
            Network Topology
          </h3>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>Online</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Warning</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span>Offline</span>
          </div>
        </div>
      </div>

      <div className="p-5">
        <svg
          ref={svgRef}
          width="800"
          height="500"
          viewBox="0 0 800 500"
          className="w-full h-full"
        >
          <g>
            {connections.map((conn, index) => {
              const sourceNode = nodes.find((n) => n.id === conn.source);
              const targetNode = nodes.find((n) => n.id === conn.target);
              if (!sourceNode || !targetNode) return null;
              return (
                <g key={index}>
                  <line
                    x1={sourceNode.x}
                    y1={sourceNode.y}
                    x2={targetNode.x}
                    y2={targetNode.y}
                    stroke={conn.encrypted ? "#10b981" : "#6b7280"}
                    strokeWidth={conn.strength * 3}
                    strokeOpacity={Math.max(0.2, conn.strength)}
                  />
                </g>
              );
            })}
          </g>
          <g>
            {nodes.map((node) => {
              const Icon = getNodeIcon(node.type);
              const isHovered = hoveredNode === node.id;
              const isSelected = selectedNode?.id === node.id;
              return (
                <g key={node.id}>
                  <motion.circle
                    cx={node.x}
                    cy={node.y}
                    r={isHovered || isSelected ? 25 : 20}
                    fill={getStatusColor(node.status)}
                    stroke={getAnomalyColor(node.anomalyLevel)}
                    strokeWidth="2"
                    style={{ cursor: "pointer" }}
                    whileHover={{ scale: 1.1 }}
                    onHoverStart={() => setHoveredNode(node.id)}
                    onHoverEnd={() => setHoveredNode(null)}
                    onClick={() => setSelectedNode(isSelected ? null : node)}
                  />
                  {node.anomalyLevel !== "low" && (
                    <circle
                      cx={node.x + 15}
                      cy={node.y - 15}
                      r="8"
                      fill={getAnomalyColor(node.anomalyLevel)}
                    />
                  )}
                  <foreignObject
                    x={node.x - 12}
                    y={node.y - 12}
                    width="24"
                    height="24"
                    style={{ pointerEvents: "none" }}
                  >
                    <div className="w-full h-full flex items-center justify-center">
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                  </foreignObject>
                  <text
                    x={node.x}
                    y={node.y + 35}
                    fontSize="12"
                    fill="currentColor"
                    textAnchor="middle"
                    className="font-medium"
                  >
                    {node.name}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="mt-6 p-4 bg-muted/50 rounded-lg border border-border"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-foreground">
                    {selectedNode.name}
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    ID: {selectedNode.id} • Type: {selectedNode.type}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Activity className="h-3 w-3 text-green-500" />
                  <span className="text-xs text-green-500">
                    {selectedNode.status}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Anomaly Level:</span>
                  <div className="flex items-center gap-2 mt-1">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        backgroundColor: getAnomalyColor(
                          selectedNode.anomalyLevel,
                        ),
                      }}
                    />
                    <span className="font-medium capitalize">
                      {selectedNode.anomalyLevel}
                    </span>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Last Seen:</span>
                  <div className="font-medium mt-1">
                    {selectedNode.lastSeen}
                  </div>
                </div>
              </div>
              {selectedNode.anomalyLevel !== "low" && (
                <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm text-amber-500">
                    Security attention required
                  </span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default NetworkTopology;
