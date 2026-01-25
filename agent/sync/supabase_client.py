"""
Supabase Sync Client

Optional cloud synchronization for centralized monitoring.
"""

import logging
import time
from typing import Dict, List, Optional
from supabase import create_client, Client

logger = logging.getLogger(__name__)


class SupabaseSync:
    """
    Minimal cloud synchronization for processed alerts.
    
    Offline-first design with bandwidth optimization.
    """

    def __init__(
        self,
        supabase_url: str,
        supabase_key: str,
        enabled: bool = True,
    ):
        """
        Initialize Supabase sync client.
        
        Args:
            supabase_url: Supabase project URL
            supabase_key: Supabase anon key
            enabled: Enable sync (default: True)
        """
        self.supabase_url = supabase_url
        self.supabase_key = supabase_key
        self.enabled = enabled
        
        self.client: Optional[Client] = None
        self.is_connected = False
        
        if enabled:
            self.connect()

    def connect(self) -> bool:
        """
        Connect to Supabase.
        
        Returns:
            True if connected successfully
        """
        if not self.enabled:
            return False
        
        try:
            self.client = create_client(self.supabase_url, self.supabase_key)
            self.is_connected = True
            logger.info("Connected to Supabase")
            return True
        except Exception as e:
            logger.error(f"Error connecting to Supabase: {e}")
            self.is_connected = False
            return False

    def is_online(self) -> bool:
        """
        Check if online and connected.
        
        Returns:
            True if online
        """
        if not self.enabled or not self.client:
            return False
        
        try:
            # Simple ping to check connectivity
            self.client.table("alerts").select("id").limit(1).execute()
            self.is_connected = True
            return True
        except Exception:
            self.is_connected = False
            return False

    def sync_alert(self, alert: Dict) -> bool:
        """
        Sync an alert to Supabase.
        
        Args:
            alert: Alert dictionary
            
        Returns:
            True if synced successfully
        """
        if not self.enabled or not self.is_online():
            return False
        
        try:
            # Extract explanation from the correct location
            # The alert structure has: alert["anomaly"]["explanation"] (from report_generator)
            # and alert["explanation"] (raw SHAP explanation)
            anomaly = alert.get("anomaly", {})
            explanation = anomaly.get("explanation", {})
            
            # Fallback to raw explanation if structured explanation not available
            if not explanation.get("summary"):
                raw_explanation = alert.get("explanation", {})
                explanation_summary = raw_explanation.get("explanation_text", "No explanation available")
                contributing_factors = raw_explanation.get("top_features", [])
            else:
                explanation_summary = explanation.get("summary", "No explanation available")
                contributing_factors = explanation.get("contributing_factors", [])
            
            data = {
                "alert_id": alert.get("alert_id"),
                "timestamp": alert.get("timestamp"),
                "device_id": anomaly.get("device_id"),
                "severity": alert.get("severity"),
                "anomaly_score": alert.get("anomaly_score"),
                "anomaly_type": anomaly.get("anomaly_type"),
                "explanation_summary": explanation_summary,
                "explanation": {
                    "summary": explanation_summary,
                    "contributing_factors": contributing_factors,
                },
                "alert_data": alert,
            }
            
            self.client.table("alerts").insert(data).execute()
            logger.debug(f"Synced alert {alert.get('alert_id')}")
            return True
        except Exception as e:
            logger.error(f"Error syncing alert: {e}")
            return False

    def sync_health_summary(self, summary: Dict) -> bool:
        """
        Sync system health summary.
        
        Args:
            summary: Health summary dictionary
            
        Returns:
            True if synced successfully
        """
        if not self.enabled or not self.is_online():
            return False
        
        try:
            self.client.table("health_summaries").insert(summary).execute()
            logger.debug("Synced health summary")
            return True
        except Exception as e:
            logger.error(f"Error syncing health summary: {e}")
            return False

    def sync_hash_anchor(self, hash_data: Dict) -> bool:
        """
        Sync hash chain anchor for integrity verification.
        
        Args:
            hash_data: Hash anchor data
            
        Returns:
            True if synced successfully
        """
        if not self.enabled or not self.is_online():
            return False
        
        try:
            self.client.table("hash_anchors").insert(hash_data).execute()
            logger.debug("Synced hash anchor")
            return True
        except Exception as e:
            logger.error(f"Error syncing hash anchor: {e}")
            return False

    def batch_sync(self, items: List[Dict], table_name: str = "alerts") -> int:
        """
        Batch sync multiple items.
        
        Args:
            items: List of items to sync
            table_name: Target table name
            
        Returns:
            Number of successfully synced items
        """
        if not self.enabled or not self.is_online():
            return 0
        
        success_count = 0
        for item in items:
            try:
                self.client.table(table_name).insert(item).execute()
                success_count += 1
            except Exception as e:
                logger.warning(f"Error syncing item: {e}")
        
        logger.info(f"Batch synced {success_count}/{len(items)} items to {table_name}")
        return success_count

    def get_model_updates(self) -> Optional[bytes]:
        """
        Retrieve model updates from Supabase.
        
        Returns:
            Model data bytes or None
        """
        if not self.enabled or not self.is_online():
            return None
        
        try:
            # This would fetch model updates from storage
            # Implementation depends on Supabase storage setup
            logger.debug("Model updates retrieval not yet implemented")
            return None
        except Exception as e:
            logger.error(f"Error getting model updates: {e}")
            return None
