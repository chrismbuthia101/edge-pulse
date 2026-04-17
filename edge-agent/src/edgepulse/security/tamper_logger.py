"""
Tamper-Evident Logging for EdgePulse

Implements cryptographic hash chaining for immutable audit logs.
Provides SQLite storage with sequence constraints and digital signatures.
"""

import time
import hashlib
import json
from pathlib import Path
from typing import Dict, Optional, Any
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict

try:
    import keyring
except ImportError:
    keyring = None

from edgepulse.storage.database import DatabaseManager
from edgepulse.utils.log_handler import get_logger

logger = get_logger(__name__)

@dataclass
class TamperEntry:
    """Tamper-evident log entry"""
    log_id: str
    device_id: str
    log_sequence_number: int
    log_entry_type: str
    log_entry_reference_id: Optional[str]
    entry_timestamp_utc: datetime
    entry_content_hash: str
    previous_entry_hash: str
    digital_signature: Optional[str] = None


class TamperEvidentLogger:
    """Cryptographic tamper-evident logging system"""

    def __init__(self, device_id: str, db_manager: DatabaseManager):
        self.device_id = device_id
        self.db_manager = db_manager
        self.current_sequence = 0
        self.last_hash = "0" * 64  # Genesis hash

        self.keyring_service = "edgepulse-tamper"
        self.keyring_key = f"{device_id}_signing_key"
        self._initialized = False

    async def initialize(self) -> None:
        """Async initialisation – must be awaited before log_event() is called."""
        if self._initialized:
            return
        await self._ensure_table()
        await self._load_state()
        self._initialized = True
        logger.info(f"TamperEvidentLogger initialised for device: {self.device_id}")

    async def _ensure_table(self) -> None:
        """Ensure tamper_evident_log table exists"""
        schema = """
            CREATE TABLE IF NOT EXISTS tamper_evident_log (
                log_id TEXT PRIMARY KEY,
                device_id TEXT NOT NULL,
                log_sequence_number BIGINT NOT NULL,
                log_entry_type TEXT NOT NULL,
                log_entry_reference_id TEXT,
                entry_timestamp_utc TIMESTAMP NOT NULL,
                entry_content_hash TEXT NOT NULL,
                previous_entry_hash TEXT NOT NULL,
                digital_signature TEXT,
                synced INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT unique_device_sequence UNIQUE (device_id, log_sequence_number)
            )
        """
        await self.db_manager.execute_query(schema)
        await self._add_synced_column_if_missing()

    async def _add_synced_column_if_missing(self) -> None:
        """Add synced column if it doesn't exist (for existing databases)."""
        try:
            check_query = "SELECT synced FROM tamper_evident_log LIMIT 1"
            await self.db_manager.execute_query(check_query)
        except Exception:
            try:
                alter_query = "ALTER TABLE tamper_evident_log ADD COLUMN synced INTEGER DEFAULT 0"
                await self.db_manager.execute_query(alter_query)
                logger.info("Added synced column to tamper_evident_log")
            except Exception as e:
                logger.debug("synced_column_check_error", error=str(e))

    async def _load_state(self) -> None:
        """Load current sequence and last hash from database"""
        try:
            query = """
                SELECT log_sequence_number, entry_content_hash
                FROM tamper_evident_log
                WHERE device_id = ?
                ORDER BY log_sequence_number DESC
                LIMIT 1
            """

            result = await self.db_manager.execute_query(query, (self.device_id,))

            if result:
                self.current_sequence = result[0]["log_sequence_number"]
                self.last_hash = result[0]["entry_content_hash"]
                logger.info(
                    f"Loaded tamper log state: sequence {self.current_sequence}"
                )
            else:
                logger.info("No existing tamper log found, starting new chain")

        except Exception as e:
            logger.error(f"Failed to load tamper log state: {e}")

    def _get_signing_key(self) -> Optional[str]:
        """Get or generate device signing key"""
        if not keyring:
            logger.warning("keyring not available, tamper signatures disabled")
            return None

        try:
            key = keyring.get_password(self.keyring_service, self.keyring_key)
            if key:
                return key
        except Exception:
            pass

        import secrets

        new_key = secrets.token_urlsafe(32)

        try:
            keyring.set_password(self.keyring_service, self.keyring_key, new_key)
            logger.info("Generated new device signing key")
            return new_key
        except Exception as e:
            logger.error(f"Failed to store signing key: {e}")
            return None

    def _sign_entry(self, content_hash: str) -> Optional[str]:
        """Create digital signature for tamper entry"""
        signing_key = self._get_signing_key()
        if not signing_key:
            return None

        try:
            import hmac
            import base64

            signature = hmac.new(
                signing_key.encode(),
                content_hash.encode(),
                hashlib.sha256,
            ).digest()

            return base64.b64encode(signature).decode()
        except Exception as e:
            logger.error(f"Failed to sign tamper entry: {e}")
            return None

    def _compute_content_hash(self, entry_data: Dict[str, Any]) -> str:
        """Compute hash of entry content (excluding hash fields themselves)"""
        content = {
            "device_id": entry_data["device_id"],
            "log_sequence_number": entry_data["log_sequence_number"],
            "log_entry_type": entry_data["log_entry_type"],
            "log_entry_reference_id": entry_data.get("log_entry_reference_id"),
            "entry_timestamp_utc": entry_data["entry_timestamp_utc"].isoformat(),
        }

        content_json = json.dumps(content, sort_keys=True)
        return hashlib.sha256(content_json.encode()).hexdigest()

    async def log_event(
        self,
        entry_type: str,
        reference_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Log an event to the tamper-evident chain"""
        if not self._initialized:
            logger.error(
                "TamperEvidentLogger.initialize() must be awaited before log_event()"
            )
            return False

        try:
            self.current_sequence += 1

            entry_data: Dict[str, Any] = {
                "device_id": self.device_id,
                "log_sequence_number": self.current_sequence,
                "log_entry_type": entry_type,
                "log_entry_reference_id": reference_id,
                "entry_timestamp_utc": datetime.utcnow(),
            }

            content_hash = self._compute_content_hash(entry_data)

            entry = TamperEntry(
                log_id=f"tamper_{int(time.time() * 1000)}_{self.current_sequence}",
                device_id=self.device_id,
                log_sequence_number=self.current_sequence,
                log_entry_type=entry_type,
                log_entry_reference_id=reference_id,
                entry_timestamp_utc=entry_data["entry_timestamp_utc"],
                entry_content_hash=content_hash,
                previous_entry_hash=self.last_hash,
                digital_signature=self._sign_entry(content_hash),
            )

            success = await self._store_entry(entry)
            if success:
                self.last_hash = content_hash
                logger.debug(
                    f"Logged tamper event: {entry_type} "
                    f"(sequence {self.current_sequence})"
                )
                return True
            else:
                self.current_sequence -= 1
                return False

        except Exception as e:
            logger.error(f"Failed to log tamper event: {e}")
            return False

    async def _store_entry(self, entry: TamperEntry) -> bool:
        """Store tamper entry in database"""
        try:
            query = """
                INSERT INTO tamper_evident_log (
                    log_id, device_id, log_sequence_number, log_entry_type,
                    log_entry_reference_id, entry_timestamp_utc, entry_content_hash,
                    previous_entry_hash, digital_signature, synced
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """

            params = (
                entry.log_id,
                entry.device_id,
                entry.log_sequence_number,
                entry.log_entry_type,
                entry.log_entry_reference_id,
                entry.entry_timestamp_utc,
                entry.entry_content_hash,
                entry.previous_entry_hash,
                entry.digital_signature,
            )

            await self.db_manager.execute_query(query, params)
            return True

        except Exception as e:
            logger.error(f"Failed to store tamper entry: {e}")
            return False

    async def verify_chain(
        self,
        from_sequence: Optional[int] = None,
        to_sequence: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Verify tamper-evident chain integrity"""
        try:
            query = """
                SELECT log_id, log_sequence_number, log_entry_type,
                       log_entry_reference_id, entry_timestamp_utc,
                       entry_content_hash, previous_entry_hash, digital_signature
                FROM tamper_evident_log
                WHERE device_id = ?
            """
            params = [self.device_id]

            if from_sequence is not None:
                query += " AND log_sequence_number >= ?"
                params.append(from_sequence)

            if to_sequence is not None:
                query += " AND log_sequence_number <= ?"
                params.append(to_sequence)

            query += " ORDER BY log_sequence_number ASC"

            entries = await self.db_manager.execute_query(query, tuple(params))

            if not entries:
                return {
                    "is_valid": True,
                    "entries_checked": 0,
                    "message": "No entries to verify",
                }

            expected_hash = "0" * 64
            first_broken = None
            break_reason = None

            for i, entry in enumerate(entries):
                if i > 0 and entry["previous_entry_hash"] != expected_hash:
                    first_broken = entry["log_sequence_number"]
                    break_reason = (
                        f"Hash chain broken at sequence {entry['log_sequence_number']}"
                    )
                    break

                if entry["digital_signature"]:
                    signature_valid = await self._verify_signature(entry)
                    if not signature_valid:
                        first_broken = entry["log_sequence_number"]
                        break_reason = (
                            f"Invalid signature at sequence "
                            f"{entry['log_sequence_number']}"
                        )
                        break

                expected_hash = entry["entry_content_hash"]

            return {
                "is_valid": first_broken is None,
                "entries_checked": len(entries),
                "first_broken_sequence": first_broken,
                "break_reason": break_reason,
                "device_id": self.device_id,
            }

        except Exception as e:
            logger.error(f"Failed to verify tamper chain: {e}")
            return {"is_valid": False, "error": str(e)}

    async def _verify_signature(self, entry: Dict[str, Any]) -> bool:
        """Verify digital signature of tamper entry"""
        try:
            signing_key = self._get_signing_key()
            if not signing_key or not entry["digital_signature"]:
                return True

            import hmac
            import base64

            expected_signature = hmac.new(
                signing_key.encode(),
                entry["entry_content_hash"].encode(),
                hashlib.sha256,
            ).digest()

            stored_signature = base64.b64decode(entry["digital_signature"])
            return hmac.compare_digest(expected_signature, stored_signature)

        except Exception as e:
            logger.error(f"Failed to verify signature: {e}")
            return False

    async def get_chain_info(self) -> Dict[str, Any]:
        """Get information about the tamper chain"""
        try:
            stats_query = """
                SELECT
                    COUNT(*) as total_entries,
                    MIN(log_sequence_number) as first_sequence,
                    MAX(log_sequence_number) as last_sequence,
                    MAX(entry_timestamp_utc) as last_entry_time
                FROM tamper_evident_log
                WHERE device_id = ?
            """

            stats = await self.db_manager.execute_query(
                stats_query, (self.device_id,)
            )

            recent_query = """
                SELECT log_entry_type, entry_timestamp_utc, entry_content_hash
                FROM tamper_evident_log
                WHERE device_id = ?
                ORDER BY entry_timestamp_utc DESC
                LIMIT 10
            """

            recent = await self.db_manager.execute_query(
                recent_query, (self.device_id,)
            )

            return {
                "device_id": self.device_id,
                "total_entries": stats[0]["total_entries"] if stats else 0,
                "first_sequence": stats[0]["first_sequence"] if stats else 0,
                "last_sequence": stats[0]["last_sequence"] if stats else 0,
                "last_entry_time": stats[0]["last_entry_time"] if stats else None,
                "current_sequence": self.current_sequence,
                "last_hash": self.last_hash,
                "recent_entries": recent or [],
            }

        except Exception as e:
            logger.error(f"Failed to get chain info: {e}")
            return {"error": str(e)}

    async def export_chain(
        self,
        from_sequence: Optional[int] = None,
        to_sequence: Optional[int] = None,
    ) -> str:
        """Export tamper chain for verification"""
        try:
            query = """
                SELECT log_id, device_id, log_sequence_number, log_entry_type,
                       log_entry_reference_id, entry_timestamp_utc,
                       entry_content_hash, previous_entry_hash, digital_signature
                FROM tamper_evident_log
                WHERE device_id = ?
            """
            params = [self.device_id]

            if from_sequence is not None:
                query += " AND log_sequence_number >= ?"
                params.append(from_sequence)

            if to_sequence is not None:
                query += " AND log_sequence_number <= ?"
                params.append(to_sequence)

            query += " ORDER BY log_sequence_number ASC"

            entries = await self.db_manager.execute_query(query, tuple(params))

            export_data = {
                "device_id": self.device_id,
                "export_timestamp": datetime.utcnow().isoformat(),
                "entries": entries,
                "verification": await self.verify_chain(
                    from_sequence, to_sequence
                ),
            }

            return json.dumps(export_data, indent=2, default=str)

        except Exception as e:
            logger.error(f"Failed to export tamper chain: {e}")
            return json.dumps({"error": str(e)})

    async def cleanup_old_entries(self, days_to_keep: int = 90) -> int:
        """Clean up old tamper log entries"""
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=days_to_keep)

            query = """
                DELETE FROM tamper_evident_log
                WHERE device_id = ? AND entry_timestamp_utc < ?
            """

            result = await self.db_manager.execute_update(
                query, (self.device_id, cutoff_date)
            )

            deleted_count = result if isinstance(result, int) else 0
            logger.info(f"Cleaned up {deleted_count} old tamper log entries")
            return deleted_count

        except Exception as e:
            logger.error(f"Failed to cleanup old tamper entries: {e}")
            return 0


def create_tamper_logger(
    device_id: str, db_manager: DatabaseManager
) -> "TamperEvidentLogger":
    """Create tamper-evident logger instance.

    Call await logger.initialize() before using log_event().
    """
    return TamperEvidentLogger(device_id, db_manager)