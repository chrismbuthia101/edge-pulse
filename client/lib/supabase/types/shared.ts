export type AlertStatus =
  | "PENDING"
  | "ACKNOWLEDGED"
  | "INVESTIGATED"
  | "CLOSED";
export type AlertSeverity = "low" | "medium" | "high" | "critical";
export type TelemetrySource = "PROCESS" | "NETWORK" | "FILE" | "RESOURCE";
export type DeviceStatus =
  | "online"
  | "offline"
  | "gone_silent"
  | "unsynced"
  | "isolated";
export type DeviceRisk = "none" | "low" | "medium" | "high" | "critical";
export type DeviceType = "server" | "laptop" | "workstation" | "other";
export type SyncQueueStatus = "PENDING" | "SYNCING" | "COMPLETED" | "FAILED";
export type ConnectivityState = "online" | "offline";
export type UserRole = "ORG_ANALYST" | "ORG_ADMIN" | "PLATFORM_ADMIN";
export type PrivilegeLevel = "user" | "admin" | "system";
export type AccountStatus = "PENDING" | "ACTIVE" | "SUSPENDED";
