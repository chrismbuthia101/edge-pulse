export interface Organization {
  id: string;
  name: string;
  slug: string;
  domain: string | null;
  logo_url: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Billing {
  id: string;
  organization_id: string;
  stripe_customer_id: string | null;
  plan_tier: string;
  billing_email: string | null;
  billing_cycle: string | null;
  currency: string;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}