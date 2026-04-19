export interface TamperLogEntry {
    log_id: string;
    device_id: string;
    log_sequence_number: number;
    log_entry_type: string;
    log_entry_reference_id: string;
    entry_timestamp_utc: string;
    entry_content_hash: string;
    previous_entry_hash: string;
    digital_signature: string;
    created_at: string;
}

export interface VerificationResult {
    is_valid: boolean;
    entries_checked: number;
    first_broken_sequence?: number;
    break_reason?: string;
    device_id: string;
}

export interface LogDevice {
    device_id: string;
    device_name: string;
    log_count: number;
    last_log_sequence: number;
    last_entry_timestamp: string;
}
