"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Network,
  AlertTriangle,
  Monitor,
  Server,
  Wifi,
  Activity,
} from "lucide-react";

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

const mockNodes: NetworkNode[] = [
  {
    id: "gw-01",
    name: "Gateway Server",
    type: "server",
    status: "online",
    x: 400,
    y: 200,
    connections: ["srv-db-01", "srv-web-01"],
    anomalyLevel: "low",
    lastSeen: "Active now",
  },
  {
    id: "srv-db-01",
    name: "Database Server",
    type: "server",
    status: "online",
    x: 200,
    y: 100,
    connections: ["ws-finance-01", "ws-hr-01"],
    anomalyLevel: "low",
    lastSeen: "Active now",
  },
  {
    id: "srv-web-01",
    name: "Web Server",
    type: "server",
    status: "online",
    x: 600,
    y: 100,
    connections: ["ws-dev-01", "ws-dev-02"],
    anomalyLevel: "medium",
    lastSeen: "Active now",
  },
  {
    id: "ws-finance-01",
    name: "Finance WS-01",
    type: "workstation",
    status: "online",
    x: 100,
    y: 250,
    connections: [],
    anomalyLevel: "low",
    lastSeen: "Active now",
  },
  {
    id: "ws-hr-01",
    name: "HR WS-01",
    type: "workstation",
    status: "warning",
    x: 300,
    y: 350,
    connections: [],
    anomalyLevel: "high",
    lastSeen: "2 minutes ago",
  },
  {
    id: "ws-dev-01",
    name: "Dev WS-01",
    type: "workstation",
    status: "online",
    x: 500,
    y: 250,
    connections: ["mobile-01"],
    anomalyLevel: "low",
    lastSeen: "Active now",
  },
  {
    id: "ws-dev-02",
    name: "Dev WS-02",
    type: "workstation",
    status: "offline",
    x: 700,
    y: 350,
    connections: [],
    anomalyLevel: "low",
    lastSeen: "1 hour ago",
  },
  {
    id: "mobile-01",
    name: "Mobile Device",
    type: "mobile",
    status: "online",
    x: 550,
    y: 400,
    connections: [],
    anomalyLevel: "medium",
    lastSeen: "Active now",
  },
];

const mockConnections: NetworkConnection[] = [
  { source: "gw-01", target: "srv-db-01", strength: 0.9, encrypted: true },
  { source: "gw-01", target: "srv-web-01", strength: 0.8, encrypted: true },
  {
    source: "srv-db-01",
    target: "ws-finance-01",
    strength: 0.7,
    encrypted: true,
  },
  { source: "srv-db-01", target: "ws-hr-01", strength: 0.6, encrypted: true },
  { source: "srv-web-01", target: "ws-dev-01", strength: 0.8, encrypted: true },
  { source: "srv-web-01", target: "ws-dev-02", strength: 0.0, encrypted: true },
  { source: "ws-dev-01", target: "mobile-01", strength: 0.5, encrypted: true },
];

export function NetworkTopology() {
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

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
            {mockConnections.map((conn, index) => {
              const sourceNode = mockNodes.find((n) => n.id === conn.source);
              const targetNode = mockNodes.find((n) => n.id === conn.target);
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
            {mockNodes.map((node) => {
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
