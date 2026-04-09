import { BaseRepository, type QueryOptions } from '@/lib/repositories/base-repository';
import { parseSearchQuery, type FilterOption } from '@/lib/repositories/query-utils';
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

const DEFAULT_CASE_SELECT = `
  *,
  case_alerts(alert_id),
  assigned_user:analyst_users!incident_cases_assigned_to_fkey(full_name),
  creator_user:analyst_users!incident_cases_created_by_fkey(full_name)
`.trim();

export class CaseRepository extends BaseRepository<Case> {
  constructor() {
    super('incident_cases');
  }

  async findCases(options: CaseQueryOptions = {}): Promise<Case[]> {
    if (options.search) return this.findCasesWithSearch(options);

    const filters: Record<string, unknown> = {};
    if (options.status) filters.status = options.status;
    if (options.severity) filters.severity = options.severity;
    if (options.assignedTo) filters.assigned_to = options.assignedTo;

    return this.cachedQuery(
      `cases_${JSON.stringify(options)}`,
      async () => {
        let query = this.supabase.from(this.tableName).select(DEFAULT_CASE_SELECT);

        Object.entries(filters).forEach(([key, value]) => {
          query = Array.isArray(value) ? query.in(key, value) : query.eq(key, value);
        });

        if (options.startDate) query = query.gte('created_at', options.startDate);
        if (options.endDate) query = query.lte('created_at', options.endDate);
        if (options.orderBy) {
          query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending ?? true });
        }
        if (options.limit) query = query.limit(options.limit);
        if (options.offset != null) {
          query = query.range(options.offset, options.offset + (options.limit ?? 10) - 1);
        }

        const { data, error } = await query;
        if (error) throw this.handleError(error);
        return (data ?? []) as unknown as Case[];
      },
      options.cacheTTL ?? 5 * 60 * 1000
    );
  }

  private async findCasesWithSearch(options: CaseQueryOptions): Promise<Case[]> {
    let query = this.supabase.from(this.tableName).select(DEFAULT_CASE_SELECT);

    if (options.search) {
      const searchFilters = parseSearchQuery(options.search, ['title', 'description']);
      const conditions = searchFilters
        .map((f: FilterOption) => `${f.field}.ilike.%${f.value}%`)
        .join(',');
      query = query.or(conditions);
    }

    if (options.status) {
      query = Array.isArray(options.status)
        ? query.in('status', options.status)
        : query.eq('status', options.status);
    }
    if (options.severity) {
      query = Array.isArray(options.severity)
        ? query.in('severity', options.severity)
        : query.eq('severity', options.severity);
    }
    if (options.assignedTo) query = query.eq('assigned_to', options.assignedTo);
    if (options.startDate) query = query.gte('created_at', options.startDate);
    if (options.endDate) query = query.lte('created_at', options.endDate);
    if (options.orderBy) {
      query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending ?? true });
    }
    if (options.limit) query = query.limit(options.limit);
    if (options.offset != null) {
      query = query.range(options.offset, options.offset + (options.limit ?? 10) - 1);
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
    created_by?: string;
  }): Promise<Case> {
    return this.create({
      ...caseData,
      status: 'OPEN',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_activity: new Date().toISOString(),
    });
  }

  async updateCase(id: string, updates: Partial<Case>): Promise<Case> {
    return this.update(id, {
      ...updates,
      updated_at: new Date().toISOString(),
      last_activity: new Date().toISOString(),
    });
  }

  async getCaseById(id: string): Promise<Case | null> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select(DEFAULT_CASE_SELECT)
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw this.handleError(error);
      }
      return data as unknown as Case;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  async getCaseMetrics(): Promise<CaseMetrics> {
    return this.cachedQuery(
      'case_metrics',
      async () => {
        const { data, error } = await this.supabase
          .from(this.tableName)
          .select('status, severity');
        if (error) throw this.handleError(error);

        const cases = (data ?? []) as { status: string; severity: string }[];
        const metrics: CaseMetrics = {
          total: cases.length,
          open: 0, inProgress: 0, closed: 0,
          critical: 0, high: 0, medium: 0, low: 0,
        };

        for (const c of cases) {
          switch (c.status) {
            case 'OPEN': metrics.open++; break;
            case 'IN_PROGRESS': metrics.inProgress++; break;
            case 'CLOSED': metrics.closed++; break;
          }
          switch (c.severity) {
            case 'CRITICAL': metrics.critical++; break;
            case 'HIGH': metrics.high++; break;
            case 'MEDIUM': metrics.medium++; break;
            case 'LOW': metrics.low++; break;
          }
        }
        return metrics;
      },
      10 * 60 * 1000
    );
  }

  async getCaseNotes(caseId: string): Promise<CaseNote[]> {
    const { data, error } = await this.supabase
      .from('case_notes')
      .select('note_id, case_id, content, created_by, created_at')
      .eq('case_id', caseId)
      .order('created_at', { ascending: true });

    if (error) throw this.handleError(error);
    return (data || []) as unknown as CaseNote[];
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
      .select('note_id, case_id, content, created_by, created_at')
      .single();

    if (error) throw this.handleError(error);
    return data as unknown as CaseNote;
  }

  async getCaseAlerts(caseId: string): Promise<CaseAlertLink[]> {
    const { data, error } = await this.supabase
      .from('case_alerts')
      .select('alert_id, alert_severity, alert_status, device_id, created_at, explanation_json')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false });

    if (error) throw this.handleError(error);
    return (data || []) as CaseAlertLink[];
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

  unsubscribeFromCases(channelName: string): void {
    this.unsubscribe(channelName);
  }
}