import hmac
import hashlib
import json
from typing import Any, Dict, Optional, Set

RECORD_TYPE_EXCLUSIONS: Dict[str, Set[str]] = {
    "alert": {"device_id", "organization_id", "created_at", "updated_at"},
    "telemetry": {"device_id", "organization_id", "received_at"},
    "health_snapshot": {"device_id", "organization_id", "created_at"},
    "anomaly_score": {"device_id", "organization_id", "created_at"},
    "feature_vector": {"device_id", "organization_id", "created_at", "received_at"},
}

_DEFAULT_EXCLUDED: Set[str] = {
    "device_id",
    "organization_id",
    "created_at",
    "updated_at",
    "received_at",
}


def _get_excluded_fields(record_type: Optional[str]) -> Set[str]:
    if record_type is None:
        return _DEFAULT_EXCLUDED
    return RECORD_TYPE_EXCLUSIONS.get(record_type, _DEFAULT_EXCLUDED)


def compute_integrity_hash(
    api_key: str,
    record: Dict[str, Any],
    record_type: Optional[str] = None,
) -> str:
    integrity_key = hmac.new(
        api_key.encode("utf-8"),
        b"edgepulse-integrity",
        hashlib.sha256,
    ).hexdigest()

    excluded = _get_excluded_fields(record_type)

    canonical: Dict[str, Any] = {}
    for key in sorted(record.keys()):
        if key not in excluded and key != "integrity_hash" and record[key] is not None:
            canonical[key] = record[key]

    canonical_json = json.dumps(canonical, separators=(",", ":"), sort_keys=True)

    return hmac.new(
        integrity_key.encode("utf-8"),
        canonical_json.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
