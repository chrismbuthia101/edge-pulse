export type AlertStatus =
  | 'PENDING'
  | 'ACKNOWLEDGED'
  | 'INVESTIGATED'
  | 'CLOSED';

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

export type TelemetrySource = 'PROCESS' | 'NETWORK' | 'FILE' | 'RESOURCE';

export type DeviceStatus = 'online' | 'offline' | 'gone_silent' | 'unsynced' | 'isolated';

export type SyncQueueStatus = 'PENDING' | 'SYNCING' | 'FAILED' | 'DONE';

export type ConnectivityState = 'online' | 'offline';
