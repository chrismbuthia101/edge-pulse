"""
Process Monitor

Monitors process lifecycle and metadata with privacy-preserving command line hashing.
"""

import hashlib
import logging
from typing import Dict, List, Optional, Generator
from datetime import datetime
import psutil

logger = logging.getLogger(__name__)


class ProcessMonitor:
    """
    Monitors process lifecycle and metadata.
    
    Privacy: Command lines are hashed (SHA-256) before storage.
    Security: Read-only operations, handles permission errors gracefully.
    """

    def __init__(self):
        """Initialize the process monitor."""
        self._process_snapshots: Dict[int, Dict] = {}
        self._last_check_time = datetime.utcnow()

    def hash_command_line(self, cmdline: str) -> str:
        """
        Hash a command line string using SHA-256 for privacy.
        
        Args:
            cmdline: Command line string to hash
            
        Returns:
            SHA-256 hash in hexadecimal format
        """
        if not cmdline:
            return ""
        return hashlib.sha256(cmdline.encode('utf-8')).hexdigest()

    def get_process_details(self, pid: int) -> Optional[Dict]:
        """
        Get detailed information about a specific process.
        
        Args:
            pid: Process ID
            
        Returns:
            Dictionary with process details or None if process not found
        """
        try:
            process = psutil.Process(pid)
            
            # Get command line (may fail due to permissions)
            try:
                cmdline = " ".join(process.cmdline())
                cmdline_hash = self.hash_command_line(cmdline)
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                cmdline = ""
                cmdline_hash = ""
            
            # Get parent process
            try:
                parent_pid = process.ppid()
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                parent_pid = None
            
            # Get creation time
            try:
                create_time = datetime.fromtimestamp(process.create_time())
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                create_time = None
            
            # Get CPU and memory usage
            try:
                cpu_percent = process.cpu_percent(interval=0.1)
                memory_info = process.memory_info()
                memory_percent = process.memory_percent()
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                cpu_percent = None
                memory_info = None
                memory_percent = None
            
            # Get username
            try:
                username = process.username()
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                username = None
            
            # Get status
            try:
                status = process.status()
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                status = None
            
            return {
                "pid": pid,
                "name": process.name(),
                "parent_pid": parent_pid,
                "cmdline_hash": cmdline_hash,
                "cpu_percent": cpu_percent,
                "memory_rss_bytes": memory_info.rss if memory_info else None,
                "memory_vms_bytes": memory_info.vms if memory_info else None,
                "memory_percent": memory_percent,
                "create_time": create_time.isoformat() if create_time else None,
                "username": username,
                "status": status,
                "timestamp": datetime.utcnow().isoformat(),
            }
        except psutil.NoSuchProcess:
            return None
        except psutil.AccessDenied:
            logger.warning(f"Access denied for process {pid}")
            return None
        except Exception as e:
            logger.error(f"Error getting process details for PID {pid}: {e}")
            return None

    def get_running_processes(self) -> List[Dict]:
        """
        Get information about all currently running processes.
        
        Returns:
            List of dictionaries containing process information
        """
        processes = []
        current_pids = set()
        
        try:
            for proc in psutil.process_iter(['pid', 'name', 'ppid', 'create_time']):
                try:
                    pid = proc.info['pid']
                    current_pids.add(pid)
                    
                    process_details = self.get_process_details(pid)
                    if process_details:
                        processes.append(process_details)
                        # Update snapshot
                        self._process_snapshots[pid] = process_details
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
                except Exception as e:
                    logger.warning(f"Error processing PID {proc.info.get('pid')}: {e}")
                    continue
        except Exception as e:
            logger.error(f"Error iterating processes: {e}")
        
        # Remove terminated processes from snapshots
        terminated_pids = set(self._process_snapshots.keys()) - current_pids
        for pid in terminated_pids:
            del self._process_snapshots[pid]
        
        return processes

    def watch_for_new_processes(self) -> Generator[Dict, None, None]:
        """
        Generator that yields new processes as they are created.
        
        Yields:
            Dictionary containing new process information
        """
        current_pids = set()
        
        try:
            for proc in psutil.process_iter(['pid']):
                try:
                    pid = proc.info['pid']
                    current_pids.add(pid)
                    
                    # Check if this is a new process
                    if pid not in self._process_snapshots:
                        process_details = self.get_process_details(pid)
                        if process_details:
                            self._process_snapshots[pid] = process_details
                            yield process_details
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
        except Exception as e:
            logger.error(f"Error watching for new processes: {e}")
        
        # Update snapshots
        self._process_snapshots = {
            pid: self._process_snapshots[pid]
            for pid in current_pids
            if pid in self._process_snapshots
        }

    def get_process_tree(self, root_pid: int) -> Dict:
        """
        Get process tree starting from a root PID.
        
        Args:
            root_pid: Root process ID
            
        Returns:
            Dictionary representing the process tree
        """
        def build_tree(pid: int, visited: set) -> Optional[Dict]:
            if pid in visited:
                return None
            visited.add(pid)
            
            process_details = self.get_process_details(pid)
            if not process_details:
                return None
            
            children = []
            try:
                process = psutil.Process(pid)
                for child in process.children(recursive=False):
                    child_tree = build_tree(child.pid, visited)
                    if child_tree:
                        children.append(child_tree)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
            
            process_details["children"] = children
            return process_details
        
        visited = set()
        return build_tree(root_pid, visited)

    def get_process_statistics(self) -> Dict:
        """
        Get aggregate statistics about running processes.
        
        Returns:
            Dictionary with process statistics
        """
        processes = self.get_running_processes()
        
        if not processes:
            return {
                "timestamp": datetime.utcnow().isoformat(),
                "total_processes": 0,
                "unique_names": 0,
                "total_cpu_percent": 0.0,
                "total_memory_bytes": 0,
            }
        
        unique_names = len(set(p.get("name", "") for p in processes))
        total_cpu = sum(p.get("cpu_percent", 0) or 0 for p in processes)
        total_memory = sum(p.get("memory_rss_bytes", 0) or 0 for p in processes)
        
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "total_processes": len(processes),
            "unique_names": unique_names,
            "total_cpu_percent": total_cpu,
            "total_memory_bytes": total_memory,
        }
