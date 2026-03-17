import { AlertRepository } from '@/lib/repositories';
import type {
  AlertQueryOptions,
  AlertMetrics,
  AlertSubscriptionCallbacks,
} from '@/lib/repositories/alert-repository';
import type { Alert, AlertStatus } from '@/lib/supabase/types';

export interface GetAlertsOptions {
  limit?: number;
  deviceId?: string;
  status?: AlertStatus | AlertStatus[];
  severity?: string | string[];
  category?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  unreadOnly?: boolean;
}

export interface UpdateAlertStatusOptions {
  userId?: string;
}

export type BulkOperation = 'acknowledge' | 'investigate' | 'close' | 'mark_read';

export interface BulkUpdateAlertsOptions {
  alertIds: string[];
  operation: BulkOperation;
  options?: { userId?: string };
}

export interface AlertSubscriptionOptions {
  onNewAlert?: (alert: Alert) => void;
  onAlertUpdated?: (alert: Alert) => void;
  onAlertClosed?: (alert: Alert) => void;
  onError?: (error: Error) => void;
}

// ─── Status mapping ────────────────────────────────────────────────────────────

const OPERATION_TO_STATUS: Record<Exclude<BulkOperation, 'mark_read'>, AlertStatus> = {
  acknowledge: 'ACKNOWLEDGED',
  investigate: 'INVESTIGATED',
  close: 'CLOSED',
};

// ─── Service ───────────────────────────────────────────────────────────────────

export class AlertService {
  private channelName: string | null = null;

  constructor(private readonly repository: AlertRepository) { }

  // ── Queries ────────────────────────────────────────────────────────────────

  async getAlerts(options: GetAlertsOptions = {}): Promise<Alert[]> {
    return this.repository.findAlerts({
      deviceId: options.deviceId,
      status: options.status,
      severity: options.severity as AlertQueryOptions['severity'],
      category: options.category,
      search: options.search,
      startDate: options.startDate,
      endDate: options.endDate,
      unreadOnly: options.unreadOnly,
      limit: options.limit,
      orderBy: { column: 'created_at', ascending: false },
    });
  }

  async getAlertById(id: string): Promise<Alert | null> {
    const results = await this.repository.findAlerts({
      filters: { id },
      limit: 1,
    } as AlertQueryOptions);
    return results[0] ?? null;
  }

  async getRecentAlerts(limit = 50): Promise<Alert[]> {
    return this.repository.getRecentAlerts(limit);
  }

  async getActiveAlerts(limit = 100): Promise<Alert[]> {
    return this.repository.getActiveAlerts(limit);
  }

  async getPendingAlerts(): Promise<Alert[]> {
    return this.repository.getPendingAlerts();
  }

  async getCriticalAlerts(): Promise<Alert[]> {
    return this.repository.getCriticalAlerts();
  }

  async getAlertsNeedingAttention(): Promise<Alert[]> {
    return this.repository.getAlertsNeedingAttention();
  }

  async searchAlerts(query: string, options: GetAlertsOptions = {}): Promise<Alert[]> {
    return this.repository.searchAlerts(query, {
      deviceId: options.deviceId,
      status: options.status,
      severity: options.severity as AlertQueryOptions['severity'],
      limit: options.limit,
      orderBy: { column: 'created_at', ascending: false },
    });
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  async updateAlertStatus(
    id: string,
    status: AlertStatus,
    options: UpdateAlertStatusOptions = {}
  ): Promise<Alert> {
    return this.repository.updateAlertStatus(id, status, options.userId);
  }

  async markAlertRead(id: string): Promise<Alert> {
    return this.repository.markAsRead(id);
  }

  async bulkUpdateAlerts(params: BulkUpdateAlertsOptions): Promise<Alert[] | void> {
    const { alertIds, operation, options = {} } = params;

    if (operation === 'mark_read') {
      return this.repository.markMultipleAsRead(alertIds);
    }

    const status = OPERATION_TO_STATUS[operation];
    return this.repository.bulkUpdateStatus(alertIds, status, options.userId);
  }

  // ── Aggregations ───────────────────────────────────────────────────────────

  async getMetrics(): Promise<AlertMetrics> {
    return this.repository.getAlertMetrics();
  }

  async getAlertsByTimeRange(
    startDate: string,
    endDate: string,
    groupBy: 'hour' | 'day' | 'week' = 'day'
  ): Promise<{ timestamp: string; count: number }[]> {
    return this.repository.getAlertsByTimeRange(startDate, endDate, groupBy);
  }

  async getTopCategories(limit = 10): Promise<{ category: string; count: number }[]> {
    return this.repository.getTopCategories(limit);
  }

  // ── Realtime ───────────────────────────────────────────────────────────────

  subscribeToAlerts(callbacks: AlertSubscriptionOptions): void {
    if (this.channelName) {
      this.repository.unsubscribeFromAlerts(this.channelName);
    }

    const repoCallbacks: AlertSubscriptionCallbacks = {
      onInsert: (alert) => {
        callbacks.onNewAlert?.(alert);
      },
      onUpdate: (alert) => {
        if (alert.status === 'CLOSED') {
          callbacks.onAlertClosed?.(alert);
        } else {
          callbacks.onAlertUpdated?.(alert);
        }
      },
      onDelete: (alert) => {
        callbacks.onAlertClosed?.(alert);
      },
      onError: (err) => {
        callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
      },
    };

    this.channelName = this.repository.subscribeToAlerts({}, repoCallbacks);
  }

  unsubscribeFromAlerts(): void {
    if (this.channelName) {
      this.repository.unsubscribeFromAlerts(this.channelName);
      this.channelName = null;
    }
  }
}