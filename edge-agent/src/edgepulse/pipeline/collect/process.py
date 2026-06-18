from edgepulse.utils.log_handler import get_logger
from typing import Dict, List, Optional, Any
from datetime import datetime
import psutil
from edgepulse.utils.error_handler import PermissionError, ResourceError

logger = get_logger(__name__)


class ProcessMonitor:
    def __init__(self) -> None:
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

    def get_process_details(self, pid: int) -> Optional[Dict[str, Any]]:
        try:
            process = psutil.Process(pid)

            try:
                cmdline_list = process.cmdline()
                cmdline = " ".join(cmdline_list) if cmdline_list else ""
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                cmdline = ""

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
                cpu_percent = process.cpu_percent(interval=0.01)
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

            privilege_level = self._determine_privilege_level(process, username)

            process_details: Dict[str, Any] = {
                "pid": pid,
                "name": process.name(),
                "parent_pid": parent_pid,
                "exe_path": exe_path,
                "cmdline": cmdline,
                "cpu_percent": cpu_percent,
                "memory_rss_bytes": memory_info.rss if memory_info else None,
                "memory_vms_bytes": memory_info.vms if memory_info else None,
                "memory_percent": memory_percent,
                "create_time": create_time.isoformat() if create_time else None,
                "username": username,
                "status": status,
                "privilege_level": privilege_level,
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
        try:
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
        if not username:
            return False

        username_lower = username.lower()

        if "\\" in username_lower:
            parts = username_lower.split("\\")
            if len(parts) == 2:
                domain, user = parts
                if domain in ["administrator", "admin"] or user in ["administrator", "admin"]:
                    return True
        else:
            if username_lower in ["administrator", "admin"]:
                return True

        admin_patterns = ["administrator", "admin", "root", "sudo"]
        return any(pattern in username_lower for pattern in admin_patterns)

    def _is_system_username(self, username: str) -> bool:
        if not username:
            return False

        username_lower = username.lower()

        system_patterns = [
            "system",
            "local service",
            "network service",
            "nt authority\\system",
            "nt authority\\local service",
            "nt authority\\network service",
        ]

        unix_patterns = ["root", "daemon", "nobody", "system"]

        all_patterns = system_patterns + unix_patterns
        return any(pattern in username_lower for pattern in all_patterns)

    def get_running_processes(self) -> List[Dict[str, Any]]:
        import time

        start_time = time.time()
        max_collection_time = 20.0

        processes: List[Dict[str, Any]] = []

        try:
            for proc in psutil.process_iter(["pid", "name", "ppid", "create_time"]):
                if time.time() - start_time > max_collection_time:
                    logger.warning("Process collection approaching timeout, stopping early")
                    break
                try:
                    pid = proc.info["pid"]

                    process_details = self.get_process_details(pid)
                    if process_details:
                        processes.append(process_details)
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

        return processes

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
