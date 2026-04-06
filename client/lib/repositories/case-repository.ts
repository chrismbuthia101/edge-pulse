import { BaseRepository, type QueryOptions } from '@/lib/repositories/base-repository';
import {
  parseSearchQuery,
  type FilterOption,
} from '@/lib/repositories/query-utils';
import type { Case, CaseStatus, CaseSeverity, RealtimeCasePayload } from '@/lib/supabase/types';
import type { CaseNote } from '@/lib/supabase/types/database';

export interface CaseAlertLink {
  alert_id: string;
  alert_severity: string;
  alert_status: string;
  device_id: string;
  created_at: string;
  explanation_json: unknown;
}

export interface CaseQueryOptions extends QueryOptions {
  status?: CaseStatus | CaseStatus[];
  severity?: CaseSeverity | CaseSeverity[];
  assignedTo?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface CaseMetrics {
  total: number;
  open: number;
  inProgress: number;
  closed: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface CaseSubscriptionCallbacks {
  onInsert?: (caseItem: Case) => void;
  onUpdate?: (caseItem: Case) => void;
  onDelete?: (caseItem: Case) => void;
  onError?: (error: unknown) => void;
}

export class CaseRepository extends BaseRepository<Case> {
  constructor() {
    super('incident_cases');
  }

  async findCases(options: CaseQueryOptions = {}): Promise<Case[]> {
    const DEFAULT_CASE_SELECT = `
      *,
      case_alerts(alert_id),
      assigned_user:analyst_users!incident_cases_assigned_to_fkey(
        full_name
      ),
      creator_user:analyst_users!incident_cases_created_by_fkey(
        full_name
      )
    `.trim();

    // Build filters for base repository
    const filters: Record<string, unknown> = {};

    if (options.status) filters.status = options.status;
    if (options.severity) filters.severity = options.severity;
    if (options.assignedTo) filters.assigned_to = options.assignedTo;

    if (options.search) {
      return this.findCasesWithSearch(options);
    }

    const additionalFilters: Record<string, unknown> = {};
    if (options.startDate || options.endDate) {
      const dateFilter: Record<string, unknown> = {};
      if (options.startDate) dateFilter.gte = options.startDate;
      if (options.endDate) dateFilter.lte = options.endDate;
      additionalFilters.created_at = dateFilter;
    }

    const combinedFilters = { ...filters, ...additionalFilters };

    return this.cachedQuery(
      `cases_${JSON.stringify(options)}`,
      async () => {
        let query = this.supabase
          .from(this.tableName)
          .select(DEFAULT_CASE_SELECT);

        // Apply filters
        Object.entries(combinedFilters).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            query = query.in(key, value);
          } else {
            query = query.eq(key, value);
          }
        });

        if (options.startDate) query = query.gte('created_at', options.startDate);
        if (options.endDate) query = query.lte('created_at', options.endDate);

        if (options.orderBy) {
          query = query.order(options.orderBy.column, {
            ascending: options.orderBy.ascending ?? true,
          });
        }

        if (options.limit) {
          query = query.limit(options.limit);
        }

        if (options.offset != null) {
          query = query.range(
            options.offset,
            options.offset + (options.limit ?? 10) - 1
          );
        }

        const { data, error } = await query;
        if (error) throw this.handleError(error);
        return (data ?? []) as unknown as Case[];
      },
      options.cacheTTL ?? 5 * 60 * 1000
    );
  }

  /**
   * Helper method for searches that require OR conditions
   */
  private async findCasesWithSearch(options: CaseQueryOptions): Promise<Case[]> {
    const DEFAULT_CASE_SELECT = `
      *,
      case_alerts(alert_id),
      assigned_user:analyst_users!incident_cases_assigned_to_fkey(
        full_name
      ),
      creator_user:analyst_users!incident_cases_created_by_fkey(
        full_name
      )
    `.trim();

    let query = this.supabase
      .from(this.tableName)
      .select(DEFAULT_CASE_SELECT);

    // Apply search filters
    if (options.search) {
      const searchFilters = parseSearchQuery(options.search, ['title', 'description']);
      const searchConditions = searchFilters.map((filter: FilterOption) => {
        return `${filter.field}.ilike.%${filter.value}%`;
      }).join(',');
      query = query.or(searchConditions);
    }

    // Apply other filters
    if (options.status) {
      if (Array.isArray(options.status)) {
        query = query.in('status', options.status);
      } else {
        query = query.eq('status', options.status);
      }
    }

    if (options.severity) {
      if (Array.isArray(options.severity)) {
        query = query.in('severity', options.severity);
      } else {
        query = query.eq('severity', options.severity);
      }
    }

    if (options.assignedTo) {
      query = query.eq('assigned_to', options.assignedTo);
    }

    if (options.startDate) query = query.gte('created_at', options.startDate);
    if (options.endDate) query = query.lte('created_at', options.endDate);

    if (options.orderBy) {
      query = query.order(options.orderBy.column, {
        ascending: options.orderBy.ascending ?? true,
      });
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    if (options.offset != null) {
      query = query.range(
        options.offset,
        options.offset + (options.limit ?? 10) - 1
      );
    }

    const { data, error } = await query;
    if (error) throw this.handleError(error);
    return (data ?? []) as unknown as Case[];
  }

  async createCase(caseData: {
    title: string;
    description: string;
    severity: CaseSeverity;
    assigned_to?: string;
    alert_ids?: string[];
    created_by?: string;
  }): Promise<Case> {
    return this.create({
      ...caseData,
      case_number: `CASE-${Date.now()}`,
      status: 'OPEN',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  async updateCase(id: string, updates: Partial<Case>): Promise<Case> {
    return this.update(id, {
      ...updates,
      updated_at: new Date().toISOString(),
    });
  }

  async getCaseById(id: string): Promise<Case | null> {
    return this.findById(id);
  }

  async getCaseMetrics(): Promise<CaseMetrics> {
    return this.cachedQuery(
      'case_metrics',
      async () => {
        const cases = await this.findMany();

        const metrics: CaseMetrics = {
          total: cases.length,
          open: 0,
          inProgress: 0,
          closed: 0,
          critical: 0,
          high: 0,
          medium: 0,
          low: 0,
        };

        for (const case_ of cases) {
          // Status
          switch (case_.status) {
            case 'OPEN': metrics.open++; break;
            case 'IN_PROGRESS': metrics.inProgress++; break;
            case 'CLOSED': metrics.closed++; break;
          }

          // Severity
          switch (case_.severity) {
            case 'CRITICAL': metrics.critical++; break;
            case 'HIGH': metrics.high++; break;
            case 'MEDIUM': metrics.medium++; break;
            case 'LOW': metrics.low++; break;
          }
        }

        return metrics;
      },
      10 * 60 * 1000 // 10 minutes cache
    );
  }

  async getCaseNotes(caseId: string): Promise<CaseNote[]> {
    const { data, error } = await this.supabase
      .from('case_notes')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true });

    if (error) throw this.handleError(error);
    return data || [];
  }

  async addCaseNote(caseId: string, content: string, createdBy: string): Promise<CaseNote> {
    const { data, error } = await this.supabase
      .from('case_notes')
      .insert({
        case_id: caseId,
        content,
        created_by: createdBy,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw this.handleError(error);
    return data;
  }

  async getCaseAlerts(caseId: string): Promise<CaseAlertLink[]> {
    const { data, error } = await this.supabase
      .from('case_alerts')
      .select(`
        alert_id,
        alert_severity,
        alert_status,
        device_id,
        created_at,
        explanation_json
      `)
      .eq('case_id', caseId)
      .order('created_at', { ascending: false });

    if (error) throw this.handleError(error);
    return data || [];
  }

  subscribeToCases(
    filters: Partial<CaseQueryOptions> = {},
    callbacks: CaseSubscriptionCallbacks = {}
  ): string {
    const channelName = `realtime-cases-${Date.now()}`;

    this.subscribe(channelName, filters, (payload) => {
      try {
        const p = payload as RealtimeCasePayload;
        switch (p.eventType) {
          case 'INSERT': callbacks.onInsert?.(p.new); break;
          case 'UPDATE': callbacks.onUpdate?.(p.new); break;
          case 'DELETE': callbacks.onDelete?.(p.old as Case); break;
        }
      } catch (error) {
        callbacks.onError?.(error);
      }
    });

    return channelName;
  }

  /** Unsubscribes a specific case realtime channel by its name. */
  unsubscribeFromCases(channelName: string): void {
    this.unsubscribe(channelName);
  }

  
}
