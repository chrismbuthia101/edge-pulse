import { LogsRepository } from '@/lib/repositories';
import type { HashChainStatus } from '@/lib/supabase/types';

export interface TamperAlert {
  id: string;
  device_id: string;
  device_name: string;
  alert_type: "CHAIN_BREAK" | "SIGNATURE_MISMATCH" | "SEQUENCE_GAP" | "HASH_MISMATCH";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  message: string;
  sequence_number: number;
  detected_at: string;
  status: "ACTIVE" | "INVESTIGATING" | "RESOLVED";
  affected_entries: number;
}

export interface IntegrityMetrics {
  total_devices: number;
  verified_devices: number;
  compromised_devices: number;
  total_entries: number;
  verified_entries: number;
  last_verification: string;
  verification_rate: number;
  average_chain_length: number;
}

export interface LogIntegrityServiceDependencies {
  repository: LogsRepository;
}

export interface IntegrityUpdateCallbacks {
  onStatusUpdate: (statuses: HashChainStatus[]) => void;
  onTamperAlert: (alert: TamperAlert) => void;
  onIntegrityMetricsUpdate: (metrics: IntegrityMetrics) => void;
  onVerificationComplete: (deviceId: string, success: boolean) => void;
  onError: (error: Error) => void;
}

export class LogIntegrityService {
  private repository: LogsRepository;
  private subscription: { unsubscribe: () => void } | null = null;

  constructor(dependencies: LogIntegrityServiceDependencies) {
    this.repository = dependencies.repository;
  }

  async getHashChainStatuses(): Promise<HashChainStatus[]> {
    try {
      return await this.repository.getHashChainStatuses();
    } catch (error) {
      console.error('Failed to fetch hash chain statuses:', error);
      return [];
    }
  }

  async verifyDeviceChain(deviceId: string): Promise<void> {
    try {
      const verificationResult = await this.repository.verifyChain(deviceId);

      if (verificationResult.is_valid) {
        // Mark the device as verified
        await this.repository.verifyDeviceChain(deviceId);
      } else {
        throw new Error(verificationResult.break_reason || 'Hash chain verification failed');
      }
    } catch (error) {
      console.error(`Failed to verify device ${deviceId}:`, error);
      throw error;
    }
  }

  async getTamperAlerts(): Promise<TamperAlert[]> {
    try {
      return await this.repository.getTamperAlerts();
    } catch (error) {
      console.error('Failed to fetch tamper alerts:', error);
      return [];
    }
  }

  async getIntegrityMetrics(): Promise<IntegrityMetrics> {
    try {
      const statuses = await this.getHashChainStatuses();

      const totalDevices = statuses.length;
      const verifiedDevices = statuses.filter(s => s.verified).length;
      const compromisedDevices = statuses.filter(s => !s.verified && s.broken_at_sequence).length;
      const totalEntries = statuses.reduce((sum, s) => sum + s.total_entries, 0);
      const verifiedEntries = verifiedDevices * 1000; // Estimate
      const verificationRate = totalDevices > 0 ? (verifiedDevices / totalDevices) * 100 : 0;
      const averageChainLength = totalDevices > 0 ? totalEntries / totalDevices : 0;

      return {
        total_devices: totalDevices,
        verified_devices: verifiedDevices,
        compromised_devices: compromisedDevices,
        total_entries: totalEntries,
        verified_entries: verifiedEntries,
        last_verification: new Date().toISOString(),
        verification_rate: Math.round(verificationRate),
        average_chain_length: Math.round(averageChainLength)
      };
    } catch (error) {
      console.error('Failed to fetch integrity metrics:', error);
      // Return empty metrics on error
      return {
        total_devices: 0,
        verified_devices: 0,
        compromised_devices: 0,
        total_entries: 0,
        verified_entries: 0,
        last_verification: new Date().toISOString(),
        verification_rate: 0,
        average_chain_length: 0
      };
    }
  }

  subscribeToIntegrityUpdates(callbacks: IntegrityUpdateCallbacks): void {
    // Subscribe to real-time updates for tamper evident logs
    // For now, we'll set up a simple polling mechanism
    // In a real implementation, this would use Supabase realtime subscriptions

    let previousAlerts: TamperAlert[] = [];
    let previousMetrics: IntegrityMetrics | null = null;

    const pollInterval = setInterval(async () => {
      try {
        // Update hash chain statuses
        const statuses = await this.getHashChainStatuses();
        callbacks.onStatusUpdate(statuses);

        // Check for new tamper alerts
        const alerts = await this.getTamperAlerts();
        const newAlerts = alerts.filter(alert =>
          !previousAlerts.some(prev => prev.id === alert.id)
        );

        if (newAlerts.length > 0) {
          newAlerts.forEach(alert => callbacks.onTamperAlert(alert));
        }
        previousAlerts = alerts;

        // Update integrity metrics
        const metrics = await this.getIntegrityMetrics();
        if (!previousMetrics ||
          JSON.stringify(metrics) !== JSON.stringify(previousMetrics)) {
          callbacks.onIntegrityMetricsUpdate(metrics);
        }
        previousMetrics = metrics;

      } catch (error) {
        callbacks.onError(error as Error);
      }
    }, 10000); // Poll every 10 seconds for more responsive updates

    this.subscription = {
      unsubscribe: () => clearInterval(pollInterval)
    };
  }

  unsubscribeFromIntegrityUpdates(): void {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
  }

  // Helper methods for UI
  getStatusIcon(verified: boolean, brokenAt: number | null) {
    if (!verified && brokenAt) {
      return { type: 'alert-triangle', color: 'text-destructive' };
    }
    return verified
      ? { type: 'shield-check', color: 'text-green-500' }
      : { type: 'shield', color: 'text-amber-500' };
  }

  getStatusColor(verified: boolean, brokenAt: number | null) {
    if (!verified && brokenAt) return "text-destructive bg-destructive/10 border-destructive/20";
    return verified ? "text-green-500 bg-green-500/10 border-green-500/20" : "text-amber-500 bg-amber-500/10 border-amber-500/20";
  }

  getStatusText(verified: boolean, brokenAt: number | null) {
    if (!verified && brokenAt) return "Compromised";
    return verified ? "Verified" : "Unverified";
  }
}
