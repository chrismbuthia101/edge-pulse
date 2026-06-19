import { DeviceEnrollmentRepository } from "@/lib/repositories";
import type { EnrollmentTokenRow } from "@/lib/supabase/types";
import type { CreateTokenOptions, CreateTokenResult } from "@/lib/repositories";
import { toast } from "sonner";
import { AuthService } from "@/lib/services/auth-service";

export class DeviceEnrollmentService {
  constructor(
    private repository: DeviceEnrollmentRepository,
    private authService: AuthService,
  ) {}

  async getTokens(options?: { limit?: number; includeExpired?: boolean }) {
    return await this.repository.getTokens(options);
  }

  async getTokenById(tokenId: string): Promise<EnrollmentTokenRow | null> {
    return await this.repository.getTokenById(tokenId);
  }

  async createToken(options: CreateTokenOptions): Promise<CreateTokenResult> {
    const token = this.generateSecureToken();
    const tokenHash = await this.hashToken(token);

    const userData = await this.authService.getCurrentUser();

    if (!userData) {
      throw new Error("User not authenticated");
    }

    const enrollmentToken = await this.repository.createToken(
      userData.id,
      options,
    );

    try {
      await navigator.clipboard.writeText(token);
    } catch (err) {
      console.warn("Failed to copy token to clipboard:", err);
    }

    return {
      token,
      tokenHash,
      enrollmentToken,
    };
  }

  async deleteToken(tokenId: string): Promise<void> {
    return await this.repository.deleteToken(tokenId);
  }

  async validateToken(tokenHash: string): Promise<EnrollmentTokenRow | null> {
    return await this.repository.validateToken(tokenHash);
  }

  async updateTokenUsage(
    tokenId: string,
    deviceId: string,
  ): Promise<EnrollmentTokenRow> {
    return await this.repository.updateTokenUsage(tokenId, deviceId);
  }

  async getTokensByUser(
    userId: string,
    options?: { limit?: number },
  ): Promise<EnrollmentTokenRow[]> {
    return await this.repository.getTokensByUser(userId, options);
  }

  async getEnrollmentStats() {
    return await this.repository.getEnrollmentStats();
  }

  private generateSecureToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
      .replace(/[+/=]/g, "")
      .substring(0, 40);
  }

  private async hashToken(token: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  isTokenExpired(token: EnrollmentTokenRow): boolean {
    return new Date(token.expires_at) < new Date();
  }

  isTokenFullyUsed(token: EnrollmentTokenRow): boolean {
    return token.current_uses >= token.max_uses || token.is_used;
  }

  getUsagePercentage(token: EnrollmentTokenRow): number {
    return (token.current_uses / token.max_uses) * 100;
  }

  formatTokenId(tokenId: string, showLength: number = 8): string {
    return `${tokenId.substring(0, showLength)}...`;
  }

  async copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
      toast.error("Failed to copy to clipboard");
      throw err;
    }
  }
}
