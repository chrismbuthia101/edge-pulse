import type { Alert } from "@/lib/types/alerts";
import type { Device } from "@/lib/types/devices";
import type { Notification } from "@/lib/types/notifications";

export interface RealtimeAlertPayload {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Alert;
  old: Partial<Alert>;
}

export interface RealtimeDevicePayload {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Device;
  old: Partial<Device>;
}

export interface RealtimeNotificationPayload {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Notification;
  old: Partial<{ read: boolean }>;
}
