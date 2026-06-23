import type { UserRole, AccountStatus } from "@/lib/types/shared";

export interface UserProfile {
  id: string;
  full_name: string;
  username: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationProfile {
  id: string;
  user_id: string;
  organization_id: string | null;
  role: UserRole;
  account_status: AccountStatus;
  job_title: string | null;
  joined_at: string;
  updated_at: string;
}

