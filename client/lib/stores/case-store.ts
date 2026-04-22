import { create } from 'zustand';
import { CaseRepository, type CaseAlertLink } from '@/lib/repositories/case-repository';
import { CaseService } from '@/lib/services/case-service';
import type { Case, CaseStatus, CaseSeverity } from '@/lib/supabase/types';
import type { CaseNote } from '@/lib/supabase/types/database';
import { toast } from 'sonner';

interface CaseStore {
  cases: Case[];
  loading: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  refreshCases: () => Promise<void>;
  setCases: (cases: Case[]) => void;
  clearError: () => void;

  createCase: (caseData: {
    title: string;
    description: string;
    severity: CaseSeverity;
    assignedTo?: string;
    alertIds?: string[];
    userId?: string;
  }) => Promise<Case>;
  updateCase: (id: string, updates: Partial<Case>) => void;
  updateCaseStatus: (id: string, status: CaseStatus, userId?: string) => Promise<void>;
  assignCase: (id: string, assignedTo: string) => Promise<void>;
  closeCase: (id: string, userId?: string) => Promise<void>;

  getCases: (options?: {
    status?: CaseStatus | CaseStatus[];
    severity?: CaseSeverity | CaseSeverity[];
    assignedTo?: string;
    search?: string;
    limit?: number;
  }) => Promise<Case[]>;
  getCaseById: (id: string) => Promise<Case | null>;
  getCasesByUser: (userId: string) => Promise<Case[]>;
  searchCases: (query: string, options?: {
    status?: CaseStatus | CaseStatus[];
    severity?: CaseSeverity | CaseSeverity[];
    limit?: number;
  }) => Promise<Case[]>;

  // Case notes and alerts
  getCaseNotes: (caseId: string) => Promise<CaseNote[]>;
  addCaseNote: (caseId: string, content: string, createdBy: string) => Promise<CaseNote>;
  getCaseAlerts: (caseId: string) => Promise<CaseAlertLink[]>;

  getMetrics: () => Promise<{
    total: number;
    open: number;
    inProgress: number;
    closed: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  }>;

  subscribeToCases: () => void;
  unsubscribeFromCases: () => void;
}

const caseRepository = new CaseRepository();
const caseService = new CaseService(caseRepository);

// ─── Helpers ───────────────────────────────────────────────────────────────────

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'An unexpected error occurred';
}

export const useCaseStore = create<CaseStore>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  cases: [],
  loading: false,
  error: null,

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  initialize: async () => {
    try {
      set({ loading: true, error: null });
      const cases = await caseService.getCases({ limit: 200 });
      set({ cases, loading: false });
      get().subscribeToCases();
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  refreshCases: async () => {
    try {
      set({ loading: true, error: null });
      const cases = await caseService.getCases({ limit: 200 });
      set({ cases, loading: false });
    } catch (err) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  // ── Local mutations ────────────────────────────────────────────────────────

  updateCase: (id, updates) => {
    set((state) => {
      const exists = state.cases.some((c) => c.id === id);
      const cases = exists
        ? state.cases.map((c) => (c.id === id ? { ...c, ...updates } : c))
        : [...state.cases, { ...updates, id } as Case];

      return { cases };
    });
  },

  setCases: (cases) => {
    set({ cases });
  },

  clearError: () => set({ error: null }),

  // ── Remote mutations ───────────────────────────────────────────────────────

  createCase: async (caseData) => {
    const optimisticCase: Case = {
      id: `temp-${Date.now()}`,
      case_number: `CASE-${Date.now()}`,
      title: caseData.title,
      description: caseData.description,
      severity: caseData.severity,
      status: 'OPEN',
      assigned_to: caseData.assignedTo || null,
      alert_count: caseData.alertIds?.length || 0,
      created_by: caseData.userId || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_activity: new Date().toISOString(),
      started_at: null,
      closed_at: null,
      closed_by: null,
    };

    set((state) => ({ cases: [optimisticCase, ...state.cases] }));

    try {
      const newCase = await caseService.createCase(caseData);
      set((state) => ({
        cases: state.cases.map((c) =>
          c.id === optimisticCase.id ? newCase : c
        ),
      }));
      toast.success('Case created successfully');
      return newCase;
    } catch (err) {
      set((state) => ({
        cases: state.cases.filter((c) => c.id !== optimisticCase.id),
      }));
      set({ error: errorMessage(err) });
      throw err;
    }
  },

  updateCaseStatus: async (id, status, userId) => {
    const previous = get().cases.find((c) => c.id === id);
    
    get().updateCase(id, { status });

    try {
      await caseService.updateCaseStatus(id, status, { userId });

      if (status === 'CLOSED') {
        toast.success('Case closed');
      } else if (status === 'IN_PROGRESS') {
        toast.success('Case updated to in progress');
      }
    } catch (err) {
      if (previous) get().updateCase(id, { status: previous.status });
      set({ error: errorMessage(err) });
      throw err;
    }
  },

  assignCase: async (id, assignedTo) => {
    const previous = get().cases.find((c) => c.id === id);
    
    get().updateCase(id, { assigned_to: assignedTo });

    try {
      await caseService.assignCase(id, assignedTo);
      toast.success('Case assigned');
    } catch (err) {
      if (previous) get().updateCase(id, { assigned_to: previous.assigned_to });
      set({ error: errorMessage(err) });
      throw err;
    }
  },

  closeCase: async (id, userId) => {
    const previous = get().cases.find((c) => c.id === id);
    const closedAt = new Date().toISOString();
    
    get().updateCase(id, {
      status: 'CLOSED',
      closed_at: closedAt,
      closed_by: userId
    });

    try {
      await caseService.updateCaseStatus(id, 'CLOSED', { userId });
      toast.success('Case closed');
    } catch (err) {
      if (previous) {
        get().updateCase(id, {
          status: previous.status,
          closed_at: previous.closed_at,
          closed_by: previous.closed_by
        });
      }
      set({ error: errorMessage(err) });
      throw err;
    }
  },

  // ── Queries (return data, not stored) ─────────────────────────────────────

  getCases: async (options) => {
    try {
      return await caseService.getCases(options);
    } catch (err) {
      set({ error: errorMessage(err) });
      return [];
    }
  },

  getCaseById: async (id) => {
    try {
      return await caseService.getCaseById(id);
    } catch (err) {
      set({ error: errorMessage(err) });
      return null;
    }
  },

  getCasesByUser: async (userId) => {
    try {
      return await caseService.getCasesByUser(userId);
    } catch (err) {
      set({ error: errorMessage(err) });
      return [];
    }
  },

  searchCases: async (query, options) => {
    try {
      return await caseService.searchCases(query, options);
    } catch (err) {
      set({ error: errorMessage(err) });
      return [];
    }
  },

  getMetrics: async () => {
    try {
      return await caseService.getCaseMetrics();
    } catch (err) {
      set({ error: errorMessage(err) });
      return {
        total: 0,
        open: 0,
        inProgress: 0,
        closed: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
      };
    }
  },

  // ── Case Notes and Alerts ───────────────────────────────────────────────

  getCaseNotes: async (caseId) => {
    try {
      return await caseService.getCaseNotes(caseId);
    } catch (err) {
      set({ error: errorMessage(err) });
      return [];
    }
  },

  addCaseNote: async (caseId, content, createdBy) => {
    try {
      const note = await caseService.addCaseNote(caseId, content, createdBy);
      toast.success('Note added successfully');
      return note;
    } catch (err) {
      set({ error: errorMessage(err) });
      throw err;
    }
  },

  getCaseAlerts: async (caseId) => {
    try {
      return await caseService.getCaseAlerts(caseId);
    } catch (err) {
      set({ error: errorMessage(err) });
      return [];
    }
  },

  // ── Realtime ───────────────────────────────────────────────────────────────

  subscribeToCases: () => {
    caseService.subscribeToCaseUpdates({
      onCaseCreated: (caseItem) => {
        get().updateCase(caseItem.id, caseItem);
        toast.success(`New case created: ${caseItem.title}`);
      },
      onCaseUpdated: (caseItem) => {
        get().updateCase(caseItem.id, caseItem);
      },
      onCaseDeleted: (caseItem) => {
        set((state) => ({
          cases: state.cases.filter((c) => c.id !== caseItem.id),
        }));
        toast.info(`Case deleted: ${caseItem.title}`);
      },
      onCaseStatusChanged: (caseItem, oldStatus, newStatus) => {
        get().updateCase(caseItem.id, caseItem);

        if (newStatus === 'CLOSED') {
          toast.success(`Case closed: ${caseItem.title}`);
        } else if (newStatus === 'IN_PROGRESS') {
          toast.success(`Case updated to in progress: ${caseItem.title}`);
        } else if (newStatus === 'OPEN') {
          toast.info(`Case reopened: ${caseItem.title}`);
        }
      },
      onCaseAssigned: (caseItem) => {
        get().updateCase(caseItem.id, caseItem);
        toast.success(`Case assigned: ${caseItem.title}`);
      },
      onError: (error) => {
        console.error('[CaseStore] Realtime error:', error);
        set({ error: error.message });
      },
    });
  },

  unsubscribeFromCases: () => {
    caseService.unsubscribeFromCaseUpdates();
  },
}));

export { caseService, caseRepository };
