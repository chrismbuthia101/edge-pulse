import { AlertRepository } from "@/lib/repositories";
import type { AlertQueryOptions, AlertMetrics } from "@/lib/types/alerts";
import type { Alert, AlertStatus } from "@/lib/types/alerts";
import type { Result } from "@/lib/types/shared";

const OPERATION_TO_STATUS: Record<string, AlertStatus> = {
  acknowledge: "ACKNOWLEDGED",
  investigate: "INVESTIGATED",
  close: "CLOSED",
};

export class AlertService {
  private channelName: string | null = null;

  constructor(private readonly repository: AlertRepository) {}

  public async getAlerts(options: AlertQueryOptions = {}): Promise<Result<Alert[]>> {
    const { data, error } = await this.repository.findAlerts({
      ...options,
      orderBy: { column: "created_at", ascending: false },
    });
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  public async getAlertById(id: string): Promise<Result<Alert>> {
    const { data, error } = await this.repository.findById(id);
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Alert not found" };
    return { success: true, data };
  }

  public async getAlertsPaginated(
    options: AlertQueryOptions & { page: number; limit: number },
  ): Promise<Result<{
    alerts: Alert[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  }>> {
    const result = await this.repository.findAlertsPaginated({
      ...options,
      orderBy: options.orderBy ?? { column: "created_at", ascending: false },
    });
    if (result.error) return { success: false, error: result.error.message };

    return {
      success: true,
      data: {
        alerts: result.data,
        total: result.count,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage,
      },
    };
  }

  public async getCriticalAlerts(): Promise<Result<Alert[]>> {
    const { data, error } = await this.repository.getCriticalAlerts();
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  public async updateAlertStatus(
    id: string,
    status: AlertStatus,
    userId?: string,
  ): Promise<Result<Alert>> {
    const { data, error } = await this.repository.updateAlertStatus(id, status, userId);
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Alert not found" };
    return { success: true, data };
  }

  public async markAlertRead(id: string): Promise<Result<Alert>> {
    const { data, error } = await this.repository.markAsRead(id);
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Alert not found" };
    return { success: true, data };
  }

  public async bulkMarkAlertsRead(ids: string[]): Promise<Result<void>> {
    const { error } = await this.repository.markMultipleAsRead(ids);
    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  }

  public async bulkUpdateStatus(
    ids: string[],
    status: AlertStatus,
    userId?: string,
  ): Promise<Result<Alert[]>> {
    const { data, error } = await this.repository.bulkUpdateStatus(ids, status, userId);
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  public async bulkUpdateAlerts(
    alertIds: string[],
    operation: "acknowledge" | "investigate" | "close" | "mark_read",
    options?: { userId?: string },
  ): Promise<Result<Alert[] | void>> {
    if (operation === "mark_read") {
      return this.bulkMarkAlertsRead(alertIds);
    }

    const status = OPERATION_TO_STATUS[operation];
    return this.bulkUpdateStatus(alertIds, status, options?.userId);
  }

  public async getMetrics(): Promise<Result<AlertMetrics>> {
    const { data, error } = await this.repository.getAlertMetrics();
    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "No metrics available" };
    return { success: true, data };
  }

  public subscribeToAlerts(callbacks: {
    onNewAlert?: (alert: Alert) => void;
    onAlertUpdated?: (alert: Alert) => void;
    onAlertClosed?: (alert: Alert) => void;
    onError?: (error: Error) => void;
  }): () => void {
    if (this.channelName) {
      this.repository.unsubscribeFromAlerts(this.channelName);
    }

    this.channelName = this.repository.subscribeToAlerts({}, {
      onInsert: (alert) => {
        callbacks.onNewAlert?.(alert);
      },
      onUpdate: (alert) => {
        if (alert.status === "CLOSED") {
          callbacks.onAlertClosed?.(alert);
        } else {
          callbacks.onAlertUpdated?.(alert);
        }
      },
      onDelete: (alert) => {
        callbacks.onAlertClosed?.(alert);
      },
      onError: (err) => {
        callbacks.onError?.(
          err instanceof Error ? err : new Error(String(err)),
        );
      },
    });

    const currentChannel = this.channelName;
    return () => {
      if (this.channelName === currentChannel) {
        this.repository.unsubscribeFromAlerts(this.channelName);
        this.channelName = null;
      }
    };
  }

  public unsubscribeFromAlerts(): void {
    if (this.channelName) {
      this.repository.unsubscribeFromAlerts(this.channelName);
      this.channelName = null;
    }
  }
}
