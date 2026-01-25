"""
Hash Chain Logger

Tamper-evident logging using SHA-256 hash chains.
"""

import logging
import hashlib
import json
from typing import Dict, List, Optional, Tuple
from datetime import datetime

logger = logging.getLogger(__name__)


class HashChainLogger:
    """
    Implements tamper-evident logging using SHA-256 hash chains.
    
    Each log entry is cryptographically linked to the previous one.
    """

    def __init__(self, device_id: str):
        """
        Initialize the hash chain logger.
        
        Args:
            device_id: Device identifier
        """
        self.device_id = device_id
        self.chain: List[Dict] = []
        self.sequence_number = 0
        self.genesis_hash: Optional[str] = None

    def _compute_hash(self, entry: Dict) -> str:
        """
        Compute SHA-256 hash of a log entry.
        
        Args:
            entry: Log entry dictionary
            
        Returns:
            Hexadecimal hash string
        """
        hash_string = (
            str(entry.get("sequence_number", "")) +
            str(entry.get("timestamp", "")) +
            json.dumps(entry.get("event_data", {}), sort_keys=True) +
            str(entry.get("previous_hash", ""))
        )
        
        return hashlib.sha256(hash_string.encode('utf-8')).hexdigest()

    def create_log_entry(
        self,
        event_type: str,
        event_data: Dict,
    ) -> Dict:
        """
        Create a new log entry.
        
        Args:
            event_type: Type of event
            event_data: Event data dictionary
            
        Returns:
            Complete log entry dictionary
        """
        previous_hash = self.get_chain_head()
        if previous_hash is None:
            previous_hash = "0" * 64
        
        entry = {
            "sequence_number": self.sequence_number,
            "timestamp": datetime.utcnow().isoformat(),
            "event_type": event_type,
            "event_data": event_data,
            "previous_hash": previous_hash,
            "device_id": self.device_id,
            "current_hash": None,
        }
        
        entry["current_hash"] = self._compute_hash(entry)
        
        return entry

    def append_to_chain(self, entry: Dict) -> bool:
        """
        Append a log entry to the chain.
        
        Args:
            entry: Log entry dictionary
            
        Returns:
            True if appended successfully, False if integrity check failed
        """
        previous_hash = self.get_chain_head()
        expected_previous = previous_hash if previous_hash else "0" * 64
        
        if entry.get("previous_hash") != expected_previous:
            logger.error("Hash chain integrity violation: previous hash mismatch")
            return False
        
        computed_hash = self._compute_hash(entry)
        if entry.get("current_hash") != computed_hash:
            logger.error("Hash chain integrity violation: current hash mismatch")
            return False
        
        self.chain.append(entry)
        self.sequence_number += 1
        
        if self.genesis_hash is None:
            self.genesis_hash = entry["current_hash"]
        
        return True

    def get_chain_head(self) -> Optional[str]:
        """
        Get the hash of the most recent entry (chain head).
        
        Returns:
            Hash string or None if chain is empty
        """
        if not self.chain:
            return None
        return self.chain[-1].get("current_hash")

    def verify_chain_integrity(self) -> Tuple[bool, Optional[int]]:
        """
        Verify the integrity of the entire chain.
        
        Returns:
            Tuple of (is_valid, first_tampered_index)
        """
        if not self.chain:
            return (True, None)
        
        previous_hash = "0" * 64
        
        for i, entry in enumerate(self.chain):
            if entry.get("previous_hash") != previous_hash:
                logger.error(f"Chain integrity violation at index {i}: previous hash mismatch")
                return (False, i)
            
            computed_hash = self._compute_hash(entry)
            if entry.get("current_hash") != computed_hash:
                logger.error(f"Chain integrity violation at index {i}: current hash mismatch")
                return (False, i)
            
            previous_hash = entry.get("current_hash")
        
        return (True, None)

    def export_chain(self, path: str) -> None:
        """
        Export the entire chain to a file.
        
        Args:
            path: Path to export file
        """
        try:
            export_data = {
                "device_id": self.device_id,
                "genesis_hash": self.genesis_hash,
                "chain_length": len(self.chain),
                "export_timestamp": datetime.utcnow().isoformat(),
                "chain": self.chain,
            }
            
            with open(path, 'w') as f:
                json.dump(export_data, f, indent=2)
            
            logger.info(f"Exported hash chain to {path} ({len(self.chain)} entries)")
        except Exception as e:
            logger.error(f"Error exporting hash chain: {e}")
            raise

    def import_chain(self, path: str) -> bool:
        """
        Import a chain from a file and verify integrity.
        
        Args:
            path: Path to import file
            
        Returns:
            True if imported and verified successfully
        """
        try:
            with open(path, 'r') as f:
                import_data = json.load(f)
            
            self.device_id = import_data.get("device_id", self.device_id)
            self.genesis_hash = import_data.get("genesis_hash")
            self.chain = import_data.get("chain", [])
            
            if self.chain:
                self.sequence_number = self.chain[-1].get("sequence_number", 0) + 1
            else:
                self.sequence_number = 0
            
            is_valid, tampered_index = self.verify_chain_integrity()
            
            if not is_valid:
                logger.error(f"Imported chain failed integrity check at index {tampered_index}")
                return False
            
            logger.info(f"Imported and verified hash chain from {path} ({len(self.chain)} entries)")
            return True
        except Exception as e:
            logger.error(f"Error importing hash chain: {e}")
            return False

    def get_chain_length(self) -> int:
        """Get the current chain length."""
        return len(self.chain)

    def get_entries_by_type(self, event_type: str) -> List[Dict]:
        """Get all entries of a specific event type."""
        return [entry for entry in self.chain if entry.get("event_type") == event_type]

    def get_entries_in_range(
        self,
        start_time: datetime,
        end_time: datetime,
    ) -> List[Dict]:
        """Get entries within a time range."""
        entries = []
        for entry in self.chain:
            try:
                entry_time = datetime.fromisoformat(entry.get("timestamp", ""))
                if start_time <= entry_time <= end_time:
                    entries.append(entry)
            except (ValueError, TypeError):
                continue
        return entries
