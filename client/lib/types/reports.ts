export type DateRange = "7d" | "30d" | "90d" | "all";

export type IntegrityFilter = "all" | "verified" | "tampered" | "unknown";

export type RiskFilter = "all" | "critical" | "high" | "medium" | "low";

// Device status filter (used for device integrity views)
export type StatusFilter = "all" | "online" | "offline" | "isolated";

// Alert status types (used for alert filtering)
export type AlertStatus = "PENDING" | "ACKNOWLEDGED" | "INVESTIGATED" | "CLOSED";
export type AlertStatusFilter = "all" | AlertStatus;

export type SeverityFilter = "all" | "critical" | "high" | "medium" | "low";

export type SourceFilter = "all" | "PROCESS" | "NETWORK" | "FILE" | "RESOURCE";
