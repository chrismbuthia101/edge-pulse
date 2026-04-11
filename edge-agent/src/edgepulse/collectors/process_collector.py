# Process Monitor

import hashlib
from edgepulse.utils.log_handler import get_logger
from typing import Dict, List, Optional, Generator, Any
from datetime import datetime
import psutil
from edgepulse.collectors.base import BaseCollector
from edgepulse.utils.error_handler import PermissionError, ResourceError

logger = get_logger(__name__)

class ProcessMonitor(BaseCollector):
    def __init__(self) -> None:
        self._process_snapshots: Dict[int, Dict[str, Any]] = {}
        self._last_check_time = datetime.utcnow()
        self._running = False

    def start(self) -> None:
        self._running = True
        logger.info("Process monitor started")

    def stop(self) -> None:
        self._running = False
        logger.info("Process monitor stopped")

    def collect(self) -> List[Any]:
        if not self._running:
            return []
        return [self.get_process_statistics()]

    def hash_command_line(self, cmdline: str) -> str:
        if not cmdline:
            return ""
        return hashlib.sha256(cmdline.encode('utf-8')).hexdigest()

    def get_process_details(self, pid: int) -> Optional[Dict[str, Any]]:
        try:
            process = psutil.Process(pid)
            
            try:
                cmdline_list = process.cmdline()
                cmdline = " ".join(cmdline_list) if cmdline_list else ""
                cmdline_hash = self.hash_command_line(cmdline)
                cmdline_args = cmdline_list  # Store full args list
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                cmdline = ""
                cmdline_hash = ""
                cmdline_args = []
            
            try:
                parent_pid = process.ppid()
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                parent_pid = None
            
            try:
                exe_path = process.exe()
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                exe_path = None
            
            try:
                create_time = datetime.fromtimestamp(process.create_time())
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                create_time = None

            try:
                cpu_percent = process.cpu_percent(interval=0.1)
                memory_info = process.memory_info()
                memory_percent = process.memory_percent()
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                cpu_percent = None
                memory_info = None
                memory_percent = None
            
            try:
                username = process.username()
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                username = None
            
            try:
                status = process.status()
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                status = None
            
            # Determine privilege level
            privilege_level = self._determine_privilege_level(process, username)
            
            process_details: Dict[str, Any] = {
                "pid": pid,
                "name": process.name(),
                "parent_pid": parent_pid,
                "exe_path": exe_path,  # Added executable path
                "cmdline": cmdline,  # Full command line
                "cmdline_args": cmdline_args,  # Command line arguments list
                "cmdline_hash": cmdline_hash,  # Keep for backward compatibility
                "cpu_percent": cpu_percent,
                "memory_rss_bytes": memory_info.rss if memory_info else None,
                "memory_vms_bytes": memory_info.vms if memory_info else None,
                "memory_percent": memory_percent,
                "create_time": create_time.isoformat() if create_time else None,
                "username": username,
                "status": status,
                "privilege_level": privilege_level,  # Added privilege level
                "timestamp": datetime.utcnow().isoformat(),
            }
            return process_details
        except psutil.NoSuchProcess:
            return None
        except PermissionError as e:
            logger.warning(f"Access denied for process {pid}: {e}")
            return None
        except ResourceError as e:
            logger.error(f"Error getting process details for PID {pid}: {e}")
            return None
    
    def _determine_privilege_level(self, process, username: Optional[str]) -> str:
        """Determine the privilege level of a process"""
        try:
            # Check if running as root/administrator
            if username:
                if self._is_admin_username(username):
                    return "ADMIN"
                elif self._is_system_username(username):
                    return "SYSTEM"
                else:
                    return "USER"
            else:
                return "UNKNOWN"
        except Exception:
            return "UNKNOWN"
    
    def _is_admin_username(self, username: str) -> bool:
        """Check if username indicates administrator privileges"""
        if not username:
            return False
        
        username_lower = username.lower()
        
        # Windows admin indicators
        if "\\" in username_lower:
            # Domain\username format
            parts = username_lower.split("\\")
            if len(parts) == 2:
                domain, user = parts
                if domain in ["administrator", "admin"] or user in ["administrator", "admin"]:
                    return True
        else:
            # Just username
            if username_lower in ["administrator", "admin"]:
                return True
        
        # Check for common admin patterns
        admin_patterns = ["administrator", "admin", "root", "sudo"]
        return any(pattern in username_lower for pattern in admin_patterns)
    
    def _is_system_username(self, username: str) -> bool:
        """Check if username indicates system account"""
        if not username:
            return False
        
        username_lower = username.lower()
        
        # Windows system accounts
        system_patterns = [
            "system", "local service", "network service", 
            "nt authority\\system", "nt authority\\local service",
            "nt authority\\network service"
        ]
        
        # Unix/Linux system accounts
        unix_patterns = ["root", "daemon", "nobody", "system"]
        
        all_patterns = system_patterns + unix_patterns
        return any(pattern in username_lower for pattern in all_patterns)

    def get_running_processes(self) -> List[Dict[str, Any]]:
        processes: List[Dict[str, Any]] = []
        current_pids: set[int] = set()
        
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
                except (psutil.NoSuchProcess, PermissionError):
                    continue
                except ResourceError as e:
                    logger.warning(f"Error processing PID {proc.info.get('pid')}: {e}")
                    continue
                except Exception as e:
                    logger.warning(f"Error processing PID {proc.info.get('pid')}: {e}")
                    continue
        except ResourceError as e:
            logger.error(f"Error iterating processes: {e}")
        except Exception as e:
            logger.error(f"Error iterating processes: {e}")
        
        terminated_pids = set(self._process_snapshots.keys()) - current_pids
        for pid in terminated_pids:
            del self._process_snapshots[pid]
        
        return processes

    def watch_for_new_processes(self) -> Generator[Dict[str, Any], None, None]:
        current_pids: set[int] = set()
        
        for proc in psutil.process_iter(['pid']):
            try:
                pid = proc.info['pid']
                current_pids.add(pid)
                
                if pid not in self._process_snapshots:
                    process_details = self.get_process_details(pid)
                    if process_details:
                        self._process_snapshots[pid] = process_details
                        yield process_details
            except (psutil.NoSuchProcess, PermissionError):
                continue
            except ResourceError as e:
                logger.error(f"Error watching for new processes: {e}")
                break
            except Exception as e:
                logger.error(f"Error watching for new processes: Unexpected error - {e}")
                raise ResourceError(f"Unexpected error watching for new processes: {e}")
        
        self._process_snapshots = {
            pid: self._process_snapshots[pid]
            for pid in current_pids
            if pid in self._process_snapshots
        }

    def get_process_tree(self, root_pid: int) -> Dict[str, Any]:
        def build_tree(pid: int, visited: set[int]) -> Optional[Dict[str, Any]]:
            if pid in visited:
                return None
            visited.add(pid)
            
            process_details = self.get_process_details(pid)
            if not process_details:
                return None
            
            children: List[Dict[str, Any]] = []
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
        
        visited: set[int] = set()
        return build_tree(root_pid, visited)

    def get_process_statistics(self) -> Dict[str, Any]:
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
