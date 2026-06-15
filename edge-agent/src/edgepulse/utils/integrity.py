import hmac
import hashlib
import json
from typing import Any, Dict, Set


EXCLUDED_FIELDS: Set[str] = {
    "id", "device_id", "organization_id", "created_at", "received_at",
    "updated_at", "synced", "integrity_hash", "score_id", "event_id",
    "feature_vector_id", "anomaly_score_id", "payload_hash",
    "alert_id", "feature_id", "log_id",
}


def compute_integrity_hash(api_key: str, record: Dict[str, Any]) -> str:
    integrity_key = hmac.new(
        api_key.encode("utf-8"),
        b"edgepulse-integrity",
        hashlib.sha256,
    ).hexdigest()

    canonical: Dict[str, Any] = {}
    for key in sorted(record.keys()):
        if key not in EXCLUDED_FIELDS and record[key] is not None:
            canonical[key] = record[key]

    canonical_json = json.dumps(canonical, separators=(",", ":"), sort_keys=True)

    return hmac.new(
        integrity_key.encode("utf-8"),
        canonical_json.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
