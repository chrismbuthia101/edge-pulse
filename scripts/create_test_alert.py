#!/usr/bin/env python3
"""
Test anomaly/alert generator for Edge Pulse demonstration.
Inserts a test alert directly into Supabase to trigger dashboard alerts.
"""

import os
import sys
import json
import uuid
import argparse
from datetime import datetime, timedelta
from typing import Optional

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

ALERT_CATEGORIES = [
    "network_anomaly",
    "process_behavior",
    "cpu_usage_spike",
    "memory_anomaly",
    "disk_io_pattern",
    "authentication_anomaly",
    "privilege_escalation",
]

SEVERITIES = ["low", "medium", "high", "critical"]

NETWORK_PROTOCOLS = ["TCP", "UDP", "ICMP", "HTTP", "HTTPS", "DNS", "SSH"]
PROCESS_NAMES = ["bash", "python", "node", "nginx", "postgres", "redis", "docker"]


def generate_test_alert(
    device_id: str,
    severity: str = "medium",
    category: Optional[str] = None,
    device_name: Optional[str] = None,
) -> dict:
    """Generate a test alert with realistic data."""
    
    if category is None:
        category = ALERT_CATEGORIES[hash(str(uuid.uuid4())) % len(ALERT_CATEGORIES)]
    
    if device_name is None:
        device_name = f"device-{device_id[:8]}"
    
    alert_id = str(uuid.uuid4())
    now = datetime.utcnow()
    window_start = now - timedelta(minutes=5)
    
    anomaly_score = {
        "low": 0.3,
        "medium": 0.55,
        "high": 0.75,
        "critical": 0.92,
    }.get(severity, 0.5)
    
    network_ports = [22, 80, 443, 3306, 5432, 6379, 8080, 9000]
    protocols = ["TCP", "UDP", "HTTP", "HTTPS"]
    destination_ips = [
        "10.0.1.100", "192.168.1.50", "172.16.0.25",
        "203.0.113.10", "198.51.100.20", "10.10.10.5"
    ]
    
    return {
        "alert_id": alert_id,
        "device_id": device_id,
        "device_name": device_name,
        "title": f"Test {category.replace('_', ' ').title()} Detected",
        "description": f"Anomalous {category.replace('_', ' ')} behavior detected on {device_name}. "
                      f"This is a test alert generated for demonstration purposes. "
                      f"Anomaly score: {anomaly_score:.2f}",
        "severity": severity,
        "status": "PENDING",
        "category": category,
        "confidence": anomaly_score + (hash(alert_id) % 10) / 100,
        "anomaly_score": anomaly_score,
        "model_id": f"iforest-{device_id[:8]}",
        "collection_agent_version": "1.0.0",
        "inference_latency_ms": 45 + (hash(alert_id) % 100),
        "telemetry_source": "edge_agent",
        "detection_window_start": window_start.isoformat() + "Z",
        "detection_window_end": now.isoformat() + "Z",
        "detection_window_minutes": 5,
        "net_destination_ip": destination_ips[hash(alert_id) % len(destination_ips)],
        "net_destination_port": network_ports[hash(alert_id) % len(network_ports)],
        "net_protocol": protocols[hash(alert_id) % len(protocols)],
        "net_duration_ms": 1000 + (hash(alert_id) % 5000),
        "proc_name": PROCESS_NAMES[hash(alert_id) % len(PROCESS_NAMES)],
        "proc_privilege_level": "root" if hash(alert_id) % 3 == 0 else "user",
        "proc_pid": 1000 + (hash(alert_id) % 30000),
        "created_at": now.isoformat() + "Z",
        "updated_at": now.isoformat() + "Z",
        "read": False,
    }


def insert_alert_supabase(alert: dict) -> bool:
    """Insert alert directly into Supabase via REST API."""
    import httpx
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables required")
        return False
    
    try:
        response = httpx.post(
            f"{SUPABASE_URL}/rest/v1/alert_records",
            json=[alert],
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            timeout=30.0,
        )
        
        if response.status_code in (200, 201):
            print(f"✓ Alert inserted successfully: {alert['alert_id']}")
            return True
        else:
            print(f"✗ Failed to insert alert: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"✗ Error inserting alert: {e}")
        return False


def insert_alerts_batch(alerts: list) -> bool:
    """Insert multiple alerts in a batch."""
    import httpx
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables required")
        return False
    
    try:
        response = httpx.post(
            f"{SUPABASE_URL}/rest/v1/alert_records",
            json=alerts,
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
            timeout=30.0,
        )
        
        if response.status_code in (200, 201):
            print(f"✓ Inserted {len(alerts)} alerts successfully")
            return True
        else:
            print(f"✗ Failed to insert alerts: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"✗ Error inserting alerts: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Generate test anomalies/alerts for Edge Pulse demonstration"
    )
    parser.add_argument(
        "--device-id",
        default="test-device-001",
        help="Device ID to associate alerts with",
    )
    parser.add_argument(
        "--device-name",
        default=None,
        help="Device name (optional)",
    )
    parser.add_argument(
        "--severity",
        choices=SEVERITIES,
        default="medium",
        help="Alert severity level",
    )
    parser.add_argument(
        "--category",
        choices=ALERT_CATEGORIES,
        default=None,
        help="Alert category",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=1,
        help="Number of alerts to generate",
    )
    parser.add_argument(
        "--batch",
        action="store_true",
        help="Generate multiple alerts with varying severities",
    )
    parser.add_argument(
        "--critical-batch",
        action="store_true",
        help="Generate a batch of critical alerts for demo",
    )
    
    args = parser.parse_args()
    
    if args.critical_batch:
        print("Generating critical alert batch...")
        alerts = []
        for i in range(3):
            severity = SEVERITIES[min(i, len(SEVERITIES)-1)]
            alert = generate_test_alert(
                device_id=args.device_id,
                severity=severity,
                device_name=args.device_name,
            )
            alerts.append(alert)
        success = insert_alerts_batch(alerts)
        if success:
            print("\n✓ Critical alert batch created successfully!")
            print("  These alerts should now appear on the dashboard.")
        return 0 if success else 1
    
    if args.batch:
        print(f"Generating {args.count} alerts with varying severities...")
        alerts = []
        for i in range(args.count):
            severity = SEVERITIES[i % len(SEVERITIES)]
            alert = generate_test_alert(
                device_id=args.device_id,
                severity=severity,
                category=args.category,
                device_name=args.device_name,
            )
            alerts.append(alert)
        
        success = insert_alerts_batch(alerts)
        if success:
            print(f"\n✓ Created {args.count} alerts successfully!")
            print("  These alerts should now appear on the dashboard.")
        return 0 if success else 1
    
    print(f"Generating {args.count} alert(s)...")
    for i in range(args.count):
        alert = generate_test_alert(
            device_id=args.device_id,
            severity=args.severity,
            category=args.category,
            device_name=args.device_name,
        )
        
        print(f"\n--- Alert {i+1} ---")
        print(f"  ID: {alert['alert_id']}")
        print(f"  Severity: {alert['severity']}")
        print(f"  Category: {alert['category']}")
        print(f"  Anomaly Score: {alert['anomaly_score']}")
        
        success = insert_alert_supabase(alert)
        if not success:
            return 1
    
    print(f"\n✓ Successfully created {args.count} alert(s)!")
    print("  These should now appear on the dashboard.")
    return 0


if __name__ == "__main__":
    sys.exit(main())