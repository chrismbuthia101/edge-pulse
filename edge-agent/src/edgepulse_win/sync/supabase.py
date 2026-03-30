import httpx
from datetime import datetime
from typing import Dict, List, Optional, Any
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from edgepulse_win.utils.log_handler import get_logger
from edgepulse_win.utils.device_id import get_default_device_id

logger = get_logger(__name__)

class SyncError(Exception):
    """Base exception for sync operations"""
    pass

class AuthenticationError(SyncError):
    """Authentication-related sync error"""
    pass

class NetworkError(SyncError):
    """Network-related sync error"""
    pass

class SupabaseSync:
    """Async Supabase sync client with device authentication and proper error handling"""
    
    def __init__(
        self,
        supabase_url: str,
        supabase_key: Optional[str] = None,  # Fallback key for health checks only
        device_id: Optional[str] = None,
        api_key: Optional[str] = None,
        enabled: bool = True,
        timeout: float = 10.0,
        max_retries: int = 3
    ):
        self.supabase_url = supabase_url.rstrip('/')
        self.supabase_key = supabase_key
        
        # Use hostname-based device ID if not provided
        if device_id is None:
            device_id = get_default_device_id()
            logger.info(f"Using hostname-based device ID: {device_id}")
        
        self.device_id = device_id
        self.api_key = api_key
        self.enabled = enabled
        self.timeout = timeout
        self.max_retries = max_retries
        
        # Async HTTP client
        self.client: Optional[httpx.AsyncClient] = None
        self._online = False
        self._last_health_check: Optional[datetime] = None
        
        logger.info("async_supabase_sync_initialized", enabled=enabled, has_device_auth=bool(device_id and api_key))
    
    async def initialize(self) -> None:
        """Initialize the async client"""
        if not self.enabled:
            logger.info("supabase_sync_disabled")
            return
        
        # Build headers based on authentication method
        headers = {
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        }
        
        if self.device_id and self.api_key:
            # Device authentication
            headers.update({
                "X-EdgePulse-Device-Id": self.device_id,
                "X-EdgePulse-Api-Key": self.api_key
            })
        elif self.supabase_key:
            headers.update({
                "apikey": self.supabase_key,
                "Authorization": f"Bearer {self.supabase_key}"
            })
        
        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(self.timeout),
            headers=headers
        )
        
        # Test connectivity
        await self.check_connectivity()
        
        logger.info("async_supabase_client_initialized", online=self._online)
    
    async def close(self) -> None:
        """Close the async client"""
        if self.client:
            await self.client.aclose()
            logger.info("async_supabase_client_closed")
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(NetworkError)
    )
    async def check_connectivity(self) -> bool:
        """Check connectivity to Supabase"""
        if not self.enabled or not self.client:
            return False
        
        try:
            response = await self.client.get(
                f"{self.supabase_url}/rest/v1/",
                headers={"apikey": self.supabase_key}
            )
            
            self._online = response.status_code == 200
            self._last_health_check = datetime.utcnow()
            
            if self._online:
                logger.debug("supabase_connectivity_check_success")
            else:
                logger.warning("supabase_connectivity_check_failed", status=response.status_code)
            
            return self._online
            
        except Exception as e:
            self._online = False
            logger.error("supabase_connectivity_error", error=str(e))
            raise NetworkError(f"Supabase connectivity failed: {e}") from e
    
    async def is_online(self) -> bool:
        """Check if currently online (with cached result)"""
        if not self.enabled:
            return False
        
        # Use cached result if recent (< 30 seconds)
        if (self._online and self._last_health_check and 
            (datetime.utcnow() - self._last_health_check).seconds < 30):
            return True
        
        return await self.check_connectivity()
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=30),
        retry=retry_if_exception_type(NetworkError)
    )
    async def batch_sync_alerts(self, alerts: List[Dict]) -> bool:
        """Batch upload alerts with retry logic"""
        if not alerts:
            return True
        
        if not await self.is_online():
            raise NetworkError("Supabase is offline")
        
        try:
            # Prepare payload - only send essential fields
            payload = [self._prepare_alert(alert) for alert in alerts]
            
            response = await self.client.post(
                f"{self.supabase_url}/rest/v1/alerts",
                json=payload,
                headers={
                    **self.client.headers,
                    "Prefer": "return=minimal"
                }
            )
            
            if response.status_code == 201:
                logger.info("alerts_synced_successfully", count=len(alerts))
                return True
            elif response.status_code == 401:
                # Authentication failure - critical error
                logger.critical(
                    "authentication_failure",
                    device_id=self.device_id,
                    status=response.status_code,
                    response=response.text
                )
                raise AuthenticationError("Device authentication failed - credentials may be invalid or expired")
            else:
                logger.error(
                    "alerts_sync_failed",
                    status=response.status_code,
                    response=response.text
                )
                raise NetworkError(f"HTTP {response.status_code}: {response.text}")
                
        except httpx.RequestError as e:
            logger.error("alerts_sync_network_error", error=str(e))
            raise NetworkError(f"Network error during alert sync: {e}") from e
        except Exception as e:
            logger.error("alerts_sync_error", error=str(e))
            raise SyncError(f"Alert sync failed: {e}") from e
    
    async def sync_single_alert(self, alert: Dict) -> bool:
        """Sync a single alert"""
        return await self.batch_sync_alerts([alert])
    
    async def batch_sync_telemetry(self, telemetry_data: List[Dict]) -> bool:
        """Batch upload telemetry data (optional - for critical events only)"""
        if not telemetry_data:
            return True
        
        if not await self.is_online():
            raise NetworkError("Supabase is offline")
        
        try:
            # Prepare payload - compress telemetry data
            payload = [self._prepare_telemetry(data) for data in telemetry_data]
            
            response = await self.client.post(
                f"{self.supabase_url}/rest/v1/telemetry",
                json=payload,
                headers={"Prefer": "return=minimal"}
            )
            
            if response.status_code == 201:
                logger.info("telemetry_synced_successfully", count=len(telemetry_data))
                return True
            else:
                logger.error(
                    "telemetry_sync_failed",
                    status=response.status_code,
                    response=response.text
                )
                return False
                
        except Exception as e:
            logger.error("telemetry_sync_error", error=str(e))
            return False
    
    async def get_unacknowledged_alerts(self, device_id: Optional[str] = None, limit: int = 100) -> List[Dict]:
        """Get unacknowledged alerts from Supabase"""
        if not await self.is_online():
            return []
        
        try:
            query = f"{self.supabase_url}/rest/v1/alerts?acknowledged=eq.false&order=timestamp.desc&limit={limit}"
            
            if device_id:
                query += f"&device_id=eq.{device_id}"
            
            response = await self.client.get(query)
            
            if response.status_code == 200:
                return response.json()
            else:
                logger.error("get_alerts_failed", status=response.status_code)
                return []
                
        except Exception as e:
            logger.error("get_alerts_error", error=str(e))
            return []
    
    async def acknowledge_alert(self, alert_id: str) -> bool:
        """Acknowledge an alert"""
        if not await self.is_online():
            return False
        
        try:
            response = await self.client.patch(
                f"{self.supabase_url}/rest/v1/alerts?id=eq.{alert_id}",
                json={"acknowledged": True, "acknowledged_at": datetime.utcnow().isoformat()}
            )
            
            return response.status_code == 204
            
        except Exception as e:
            logger.error("acknowledge_alert_error", alert_id=alert_id, error=str(e))
            return False
    
    async def get_device_status(self, device_id: str) -> Optional[Dict]:
        """Get device status from Supabase"""
        if not await self.is_online():
            return None
        
        try:
            response = await self.client.get(
                f"{self.supabase_url}/rest/v1/devices?id=eq.{device_id}"
            )
            
            if response.status_code == 200 and response.json():
                return response.json()[0]
            else:
                return None
                
        except Exception as e:
            logger.error("get_device_status_error", device_id=device_id, error=str(e))
            return None
    
    async def update_device_heartbeat(self, device_id: str, status_data: Dict) -> bool:
        """Update device heartbeat/status"""
        if not await self.is_online():
            return False
        
        try:
            payload = {
                "id": device_id,
                "last_seen": datetime.utcnow().isoformat(),
                "status": status_data.get("status", "online"),
                "cpu_usage": status_data.get("cpu_usage"),
                "memory_usage": status_data.get("memory_usage"),
                "alerts_count": status_data.get("alerts_count", 0),
                "version": status_data.get("version"),
            }
            
            # Use upsert (insert or update)
            response = await self.client.post(
                f"{self.supabase_url}/rest/v1/devices",
                json=payload,
                headers={"Prefer": "resolution=merge-duplicates"}
            )
            
            return response.status_code in [201, 204]
            
        except Exception as e:
            logger.error("update_device_heartbeat_error", device_id=device_id, error=str(e))
            return False
    
    def _prepare_alert(self, alert: Dict) -> Dict:
        """Extract and format only essential alert data for Supabase"""
        return {
            "alert_id": alert.get("alert_id"),
            "timestamp": alert.get("timestamp"),
            "device_id": alert.get("device_id"),
            "severity": alert.get("severity", "medium"),
            "anomaly_score": alert.get("anomaly_score", 0.0),
            "explanation_summary": alert.get("explanation", {}).get("summary", ""),
            "detector_type": alert.get("detector", "unknown"),
            "feature_importance": alert.get("explanation", {}).get("feature_importance", {}),
            "acknowledged": False,
            "created_at": datetime.utcnow().isoformat()
        }
    
    def _prepare_telemetry(self, telemetry: Dict) -> Dict:
        """Prepare telemetry data for Supabase (compressed)"""
        return {
            "device_id": telemetry.get("device_id"),
            "timestamp": telemetry.get("timestamp"),
            "cpu_percent": telemetry.get("cpu", {}).get("percent", 0),
            "memory_percent": telemetry.get("memory", {}).get("percent", 0),
            "disk_usage": telemetry.get("disk", {}).get("usage_percent", 0),
            "process_count": len(telemetry.get("processes", [])),
            "network_connections": len(telemetry.get("network", {}).get("connections", [])),
            # Compress other metrics into JSON blob
            "metrics_json": str({k: v for k, v in telemetry.items() 
                              if k not in ["device_id", "timestamp", "cpu", "memory", "disk", "processes", "network"]})
        }
    
    def get_sync_statistics(self) -> Dict[str, Any]:
        """Get sync statistics"""
        return {
            "enabled": self.enabled,
            "online": self._online,
            "last_health_check": self._last_health_check.isoformat() if self._last_health_check else None,
            "timeout": self.timeout,
            "max_retries": self.max_retries
        }
