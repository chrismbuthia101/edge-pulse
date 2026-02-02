# Hash chain core: persistence and integrity verification.

import json
import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime

from edgepulse_win.utils.error_handler import LoggingError
from edgepulse_win.utils.path_manager import PathManager

logger = logging.getLogger(__name__)


class HashChain:

    def __init__(self, device_id: str, path_manager: Optional[PathManager] = None) -> None:
        self.device_id = device_id
        self.path_manager = path_manager or PathManager()
        self.chain_path = self.path_manager.get_hash_chain_path(device_id)

        self.chain: List[Dict] = []
        self.sequence_number = 0
        self.genesis_hash: Optional[str] = None

        self._load_chain()

    @staticmethod
    def compute_hash(entry: Dict) -> str:
        import hashlib
        hash_string = (
            str(entry.get("sequence_number", "")) +
            str(entry.get("timestamp", "")) +
            str(entry.get("event_type", "")) +
            str(entry.get("device_id", "")) +
            json.dumps(entry.get("event_data", {}), sort_keys=True) +
            str(entry.get("previous_hash", ""))
        )
        return hashlib.sha256(hash_string.encode("utf-8")).hexdigest()

    def create_entry(self, event_type: str, event_data: Dict) -> Dict:
        previous_hash = self.get_head() or "0" * 64
        entry = {
            "sequence_number": self.sequence_number,
            "timestamp": datetime.utcnow().isoformat(),
            "event_type": event_type,
            "event_data": event_data,
            "previous_hash": previous_hash,
            "device_id": self.device_id,
            "current_hash": None,
        }
        entry["current_hash"] = self.compute_hash(entry)
        return entry

    def append(self, entry: Dict) -> bool:
        expected_previous = self.get_head() or "0" * 64
        if entry.get("previous_hash") != expected_previous:
            logger.error("Hash chain integrity violation: previous hash mismatch")
            return False
        if entry.get("current_hash") != self.compute_hash(entry):
            logger.error("Hash chain integrity violation: current hash mismatch")
            return False

        self.chain.append(entry)
        self.sequence_number += 1
        if self.genesis_hash is None:
            self.genesis_hash = entry["current_hash"]
        self._save_chain()
        return True

    def get_head(self) -> Optional[str]:
        """Get the hash of the most recent entry."""
        return self.chain[-1].get("current_hash") if self.chain else None

    def verify(self) -> Tuple[bool, Optional[int]]:
        if not self.chain:
            return True, None

        previous_hash = "0" * 64
        for i, entry in enumerate(self.chain):
            if entry.get("previous_hash") != previous_hash:
                logger.error(f"Chain integrity violation at index {i}: previous hash mismatch")
                return False, i
            if entry.get("current_hash") != self.compute_hash(entry):
                logger.error(f"Chain integrity violation at index {i}: current hash mismatch")
                return False, i
            previous_hash = entry["current_hash"]
        return True, None

    def export(self, path: str) -> None:
        """Export the chain to a file."""
        export_data = {
            "device_id": self.device_id,
            "genesis_hash": self.genesis_hash,
            "chain_length": len(self.chain),
            "export_timestamp": datetime.utcnow().isoformat(),
            "chain": self.chain,
        }
        with open(path, "w") as f:
            json.dump(export_data, f, indent=2)
        logger.info(f"Exported hash chain to {path} ({len(self.chain)} entries)")

    def import_from(self, path: str) -> bool:
        """Import and verify a chain from a file."""
        try:
            with open(path, "r") as f:
                import_data = json.load(f)

            self.device_id = import_data.get("device_id", self.device_id)
            self.genesis_hash = import_data.get("genesis_hash")
            self.chain = import_data.get("chain", [])
            self.sequence_number = self.chain[-1].get("sequence_number", 0) + 1 if self.chain else 0

            is_valid, tampered_index = self.verify()
            if not is_valid:
                logger.error(f"Imported chain failed integrity check at index {tampered_index}")
                return False

            logger.info(f"Imported and verified hash chain from {path} ({len(self.chain)} entries)")
            return True
        except Exception as exc:
            logger.error(f"Error importing hash chain: {exc}")
            return False

    def _load_chain(self) -> None:
        """Load chain from disk if it exists."""
        if not self.chain_path.exists():
            logger.debug(f"Hash chain file not found at {self.chain_path}, starting fresh")
            return

        try:
            with open(self.chain_path, "r") as f:
                import_data = json.load(f)

            self.device_id = import_data.get("device_id", self.device_id)
            self.genesis_hash = import_data.get("genesis_hash")
            self.chain = import_data.get("chain", [])
            self.sequence_number = self.chain[-1].get("sequence_number", 0) + 1 if self.chain else 0

            is_valid, tampered_index = self.verify()
            if not is_valid:
                raise LoggingError(f"Hash chain integrity violation at index {tampered_index}")

            logger.info(f"Loaded hash chain from {self.chain_path} ({len(self.chain)} entries)")
        except json.JSONDecodeError as exc:
            logger.error(f"Invalid JSON in hash chain file: {exc}")
            self.chain = []
            self.sequence_number = 0
            self.genesis_hash = None
        except Exception as exc:
            logger.error(f"Error loading hash chain: {exc}")
            raise LoggingError(f"Failed to load hash chain: {exc}") from exc

    def _save_chain(self) -> None:
        """Persist chain to disk atomically."""
        try:
            self.chain_path.parent.mkdir(parents=True, exist_ok=True)

            export_data = {
                "device_id": self.device_id,
                "genesis_hash": self.genesis_hash,
                "chain_length": len(self.chain),
                "last_updated": datetime.utcnow().isoformat(),
                "chain": self.chain,
            }

            temp_path = self.chain_path.with_suffix(".tmp")
            with open(temp_path, "w") as f:
                json.dump(export_data, f, indent=2)
            temp_path.replace(self.chain_path)

            logger.debug(f"Saved hash chain to {self.chain_path} ({len(self.chain)} entries)")
        except Exception as exc:
            logger.error(f"Error saving hash chain: {exc}")
            raise LoggingError(f"Failed to save hash chain: {exc}") from exc

    # Convenience aliases for compatibility
    def get_chain_length(self) -> int:
        return len(self.chain)

    def get_entries_by_type(self, event_type: str) -> List[Dict]:
        return [entry for entry in self.chain if entry.get("event_type") == event_type]

    def get_entries_in_range(self, start_time: datetime, end_time: datetime) -> List[Dict]:
        entries = []
        for entry in self.chain:
            try:
                entry_time = datetime.fromisoformat(entry.get("timestamp", ""))
                if start_time <= entry_time <= end_time:
                    entries.append(entry)
            except (ValueError, TypeError):
                continue
        return entries

    def get_chain_head(self) -> Optional[str]:
        return self.get_head()
