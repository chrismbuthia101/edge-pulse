import type { CaseSeverity, CaseStatus } from '@/lib/supabase/types/shared';

export interface Case {
  id: string;
  case_number: string;
  title: string;
  description: string | null;
  severity: CaseSeverity;
  status: CaseStatus;
  assigned_to: string | null;
  created_by: string;
  started_at: string | null;
  closed_at: string | null;
  closed_by: string | null;
  alert_count: number;
  last_activity: string;
  created_at: string;
  updated_at: string;
}