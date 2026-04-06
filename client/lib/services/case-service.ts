import { CaseRepository, type CaseAlertLink } from '@/lib/repositories/case-repository';
import type { Case, CaseStatus, CaseSeverity } from '@/lib/supabase/types';
import type { CaseNote } from '@/lib/supabase/types/database';
import type { CaseSubscriptionCallbacks } from '@/lib/repositories/case-repository';

export interface GetCasesOptions {
  limit?: number;
  status?: CaseStatus | CaseStatus[];
  severity?: CaseSeverity | CaseSeverity[];
  assignedTo?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface UpdateCaseStatusOptions {
  userId?: string;
}

export interface CreateCaseOptions {
  title: string;
  description: string;
  severity: CaseSeverity;
  assignedTo?: string;
  alertIds?: string[];
  userId?: string;
}

export interface CaseSubscriptionOptions {
  onCaseCreated?: (caseItem: Case) => void;
  onCaseUpdated?: (caseItem: Case) => void;
  onCaseDeleted?: (caseItem: Case) => void;
  onCaseStatusChanged?: (caseItem: Case, oldStatus: CaseStatus, newStatus: CaseStatus) => void;
  onCaseAssigned?: (caseItem: Case, assignedTo: string) => void;
  onCaseClosed?: (caseItem: Case) => void;
  onError?: (error: Error) => void;
}

export class CaseService {
  constructor(private repository: CaseRepository) { }

  async getCases(options: GetCasesOptions = {}): Promise<Case[]> {
    return this.repository.findCases({
      status: options.status,
      severity: options.severity,
      assignedTo: options.assignedTo,
      search: options.search,
      startDate: options.startDate,
      endDate: options.endDate,
      limit: options.limit,
    });
  }

  async getCaseById(id: string): Promise<Case | null> {
    return this.repository.findById(id);
  }

  async createCase(options: CreateCaseOptions): Promise<Case> {
    return this.repository.createCase({
      title: options.title,
      description: options.description,
      severity: options.severity,
      assigned_to: options.assignedTo,
      alert_ids: options.alertIds,
      created_by: options.userId,
    });
  }

  async updateCaseStatus(
    id: string,
    status: CaseStatus,
    options: UpdateCaseStatusOptions = {}
  ): Promise<void> {
    const updates: Partial<Case> = { status };

    if (status === 'IN_PROGRESS') {
      updates.started_at = new Date().toISOString();
      if (options.userId) updates.assigned_to = options.userId;
    }

    if (status === 'CLOSED') {
      updates.closed_at = new Date().toISOString();
      if (options.userId) updates.closed_by = options.userId;
    }

    await this.repository.updateCase(id, updates);
  }

  async assignCase(id: string, assignedTo: string): Promise<void> {
    await this.repository.updateCase(id, {
      assigned_to: assignedTo,
      updated_at: new Date().toISOString(),
    });
  }

  async getCasesByUser(userId: string): Promise<Case[]> {
    return this.repository.findCases({
      assignedTo: userId,
    });
  }

  async searchCases(query: string, options: GetCasesOptions = {}): Promise<Case[]> {
    return this.repository.findCases({
      search: query,
      status: options.status,
      severity: options.severity,
      limit: options.limit,
    });
  }

  async getCaseMetrics(): Promise<{
    total: number;
    open: number;
    inProgress: number;
    closed: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  }> {
    return this.repository.getCaseMetrics();
  }

  async getCaseNotes(caseId: string): Promise<CaseNote[]> {
    return this.repository.getCaseNotes(caseId);
  }

  async addCaseNote(caseId: string, content: string, createdBy: string): Promise<CaseNote> {
    return this.repository.addCaseNote(caseId, content, createdBy);
  }

  async getCaseAlerts(caseId: string): Promise<CaseAlertLink[]> {
    return this.repository.getCaseAlerts(caseId);
  }

  // ── Realtime ───────────────────────────────────────────────────────────────

  private channelName: string | null = null;

  subscribeToCaseUpdates(callbacks: CaseSubscriptionOptions): void {
    if (this.channelName) {
      this.repository.unsubscribeFromCases(this.channelName);
    }

    const repoCallbacks: CaseSubscriptionCallbacks = {
      onInsert: (caseItem) => {
        callbacks.onCaseCreated?.(caseItem);
      },
      onUpdate: (caseItem) => {
        callbacks.onCaseUpdated?.(caseItem);
        callbacks.onCaseStatusChanged?.(caseItem, caseItem.status, caseItem.status);
        if (caseItem.assigned_to) {
          callbacks.onCaseAssigned?.(caseItem, caseItem.assigned_to);
        }
        if (caseItem.status === 'CLOSED') {
          callbacks.onCaseClosed?.(caseItem);
        }
      },
      onDelete: (caseItem) => {
        callbacks.onCaseDeleted?.(caseItem);
      },
      onError: (err) => {
        callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
      },
    };

    this.channelName = this.repository.subscribeToCases({}, repoCallbacks);
  }

  unsubscribeFromCaseUpdates(): void {
    if (this.channelName) {
      this.repository.unsubscribeFromCases(this.channelName);
      this.channelName = null;
    }
  }
}
