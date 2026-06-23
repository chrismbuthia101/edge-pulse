export interface EnrollmentToken {
  id: string;
  name: string | null;
  token_hash?: string;
  created_by: string;
  max_uses: number;
  current_uses: number;
  expires_at: string;
  is_used: boolean;
  organization_id: string;
  created_at: string;
}

export interface CreateTokenOptions {
  name?: string;
  maxUses: number;
  expiresDays?: number;
  organizationId?: string;
}

export interface CreateTokenResult {
  token: string;
  tokenHash: string;
  enrollmentToken: EnrollmentToken;
}

export interface DeviceEnrollmentStats {
  totalTokens: number;
  activeTokens: number;
  expiredTokens: number;
  usedTokens: number;
  totalEnrollments: number;
}
