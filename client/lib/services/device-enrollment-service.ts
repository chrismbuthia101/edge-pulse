import { DeviceEnrollmentRepository } from "@/lib/repositories";
import type { EnrollmentToken, CreateTokenOptions, CreateTokenResult, DeviceEnrollmentStats } from "@/lib/types/enrollment";
import type { Result } from "@/lib/types/shared";
import type { DeviceEnrollmentQueryOptions } from "@/lib/repositories/device-enrollment-repository";

export class DeviceEnrollmentService {
  constructor(
    private readonly repository: DeviceEnrollmentRepository,
  ) {}

  public async getTokens(
    options?: DeviceEnrollmentQueryOptions,
  ): Promise<Result<EnrollmentToken[]>> {
    const { data, error } = await this.repository.getTokens(options);
    if (error) return { success: false, error: error.message };
    return { success: true, data };
  }

  public async createToken(
    createdBy: string,
    options: CreateTokenOptions,
  ): Promise<Result<CreateTokenResult>> {
    try {
      const token = this.generateSecureToken();
      const tokenHash = await this.hashToken(token);

      const { data: enrollmentToken, error } = await this.repository.createToken(
        createdBy,
        tokenHash,
        options,
      );

      if (error) return { success: false, error: error.message };
      if (!enrollmentToken) return { success: false, error: "Failed to create enrollment token" };

      return {
        success: true,
        data: {
          token,
          tokenHash,
          enrollmentToken,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create token",
      };
    }
  }

  public async deleteToken(tokenId: string): Promise<Result<void>> {
    const { error } = await this.repository.deleteToken(tokenId);
    if (error) return { success: false, error: error.message };
    return { success: true, data: undefined };
  }

  public async getEnrollmentStats(
    organizationId?: string,
  ): Promise<Result<DeviceEnrollmentStats>> {
    const { data: tokens, error } = await this.repository.getTokens({
      organizationId,
      includeExpired: true,
      limit: 10000,
    });
    if (error) return { success: false, error: error.message };

    const now = new Date();

    return {
      success: true,
      data: {
        totalTokens: tokens.length,
        activeTokens: tokens.filter(
          (t) => !t.is_used && new Date(t.expires_at) > now,
        ).length,
        expiredTokens: tokens.filter((t) => new Date(t.expires_at) <= now).length,
        usedTokens: tokens.filter((t) => t.is_used).length,
        totalEnrollments: tokens.reduce(
          (sum, t) => sum + (t.current_uses || 0),
          0,
        ),
      },
    };
  }

  private generateSecureToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
      .replace(/[+/=]/g, "")
      .substring(0, 40);
  }

  public async hashToken(token: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}
