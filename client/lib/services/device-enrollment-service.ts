import { DeviceEnrollmentRepository } from "@/lib/repositories";
import type { CreateTokenOptions, CreateTokenResult } from "@/lib/repositories";
import { AuthService } from "@/lib/services/auth-service";

export class DeviceEnrollmentService {
  constructor(
    private repository: DeviceEnrollmentRepository,
    private authService: AuthService,
  ) {}

  async getTokens(options?: { limit?: number; includeExpired?: boolean }) {
    return await this.repository.getTokens(options);
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
}
