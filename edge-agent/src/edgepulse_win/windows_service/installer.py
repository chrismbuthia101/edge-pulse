"""
Windows Service installer utilities

Provides command-line interface for managing the EdgePulse Windows Service
including installation, configuration, and maintenance operations.
"""

import sys
import os
from pathlib import Path
from typing import Optional

if sys.platform == "win32":
    import win32service
    import win32serviceutil
    import win32con
    import win32security
    import ntsecuritycon
    import win32api
    import win32event
    import servicemanager

from edgepulse_win.utils.log_handler import get_logger

logger = get_logger(__name__)

SERVICE_NAME = "EdgePulseAgent"
SERVICE_DISPLAY_NAME = "EdgePulse Monitoring Agent"
SERVICE_DESCRIPTION = "EdgePulse anomaly detection and monitoring agent for edge devices"


class ServiceInstaller:
    """Windows Service installation and management utilities"""
    
    def __init__(self):
        self.service_name = SERVICE_NAME
        self.display_name = SERVICE_DISPLAY_NAME
        self.description = SERVICE_DESCRIPTION
        
        # Service paths
        self.service_dir = Path(os.environ.get('ProgramData', 'C:\\ProgramData')) / 'EdgePulse'
        self.config_dir = self.service_dir / 'config'
        self.log_dir = self.service_dir / 'logs'
        self.data_dir = self.service_dir / 'data'
        
    def create_directories(self):
        """Create necessary service directories with proper permissions"""
        try:
            for directory in [self.service_dir, self.config_dir, self.log_dir, self.data_dir]:
                directory.mkdir(parents=True, exist_ok=True)
                
                # Set permissions for LocalSystem access
                if sys.platform == "win32":
                    try:
                        # Get LocalSystem SID
                        system_sid = win32security.ConvertStringSidToSid('S-1-5-18')
                        
                        # Get current security descriptor
                        sd = win32security.GetFileSecurity(str(directory), win32security.DACL_SECURITY_INFORMATION)
                        
                        # Create new DACL with LocalSystem full access
                        dacl = win32security.ACL()
                        dacl.AddAccessAllowedAce(
                            win32security.ACL_REVISION,
                            ntsecuritycon.FILE_ALL_ACCESS,
                            system_sid
                        )
                        
                        # Set the new security descriptor
                        sd.SetSecurityDescriptorDacl(1, dacl, 0)
                        win32security.SetFileSecurity(str(directory), win32security.DACL_SECURITY_INFORMATION, sd)
                        
                    except Exception as e:
                        logger.warning(f"Could not set permissions for {directory}: {e}")
                        
            logger.info("Service directories created successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error creating service directories: {e}")
            return False
    
    def install_service(self, python_exe: Optional[str] = None) -> bool:
        """Install the Windows Service"""
        if sys.platform != "win32":
            print("Error: Windows Service can only be installed on Windows")
            return False
            
        try:
            # Find Python executable
            if not python_exe:
                python_exe = sys.executable
                
            # Get the service script path
            service_script = Path(__file__).parent / "service.py"
            
            # Create service command
            service_cmd = f'"{python_exe}" "{service_script}"'
            
            # Install the service
            win32serviceutil.InstallService(
                None,  # Use default class
                self.service_name,
                self.display_name,
                description=self.description,
                startType=win32service.SERVICE_AUTO_START,
                exeName=service_cmd,
                displayName=self.display_name,
                description=self.description
            )
            
            # Set service to run under LocalSystem
            self._configure_service_permissions()
            
            print(f"Service '{self.service_name}' installed successfully")
            print(f"Service executable: {service_cmd}")
            print(f"Service will run under LocalSystem account")
            print(f"Service data directory: {self.service_dir}")
            
            return True
            
        except Exception as e:
            print(f"Error installing service: {e}")
            logger.error(f"Service installation failed: {e}")
            return False
    
    def _configure_service_permissions(self):
        """Configure service to run under LocalSystem with proper permissions"""
        try:
            # Open service manager
            scm = win32service.OpenSCManager(
                None, None, 
                win32service.SC_MANAGER_ALL_ACCESS
            )
            
            # Open the service
            service = win32service.OpenService(
                scm, self.service_name,
                win32service.SERVICE_ALL_ACCESS
            )
            
            # Configure service to run under LocalSystem
            win32service.ChangeServiceConfig2(
                service,
                win32service.SERVICE_CONFIG_SERVICE_SID_INFO,
                {'ServiceSidType': win32service.SERVICE_SID_TYPE_UNRESTRICTED}
            )
            
            # Close handles
            win32service.CloseServiceHandle(service)
            win32service.CloseServiceHandle(scm)
            
            logger.info("Service permissions configured successfully")
            
        except Exception as e:
            logger.warning(f"Could not configure service permissions: {e}")
    
    def uninstall_service(self) -> bool:
        """Uninstall the Windows Service"""
        if sys.platform != "win32":
            print("Error: Windows Service can only be uninstalled on Windows")
            return False
            
        try:
            # Stop service if running
            if self.is_service_running():
                self.stop_service()
                
            # Remove service
            win32serviceutil.RemoveService(self.service_name)
            
            print(f"Service '{self.service_name}' uninstalled successfully")
            return True
            
        except Exception as e:
            print(f"Error uninstalling service: {e}")
            logger.error(f"Service uninstallation failed: {e}")
            return False
    
    def start_service(self) -> bool:
        """Start the Windows Service"""
        if sys.platform != "win32":
            print("Error: Windows Service can only be started on Windows")
            return False
            
        try:
            win32serviceutil.StartService(self.service_name)
            print(f"Service '{self.service_name}' started successfully")
            return True
            
        except Exception as e:
            print(f"Error starting service: {e}")
            logger.error(f"Service start failed: {e}")
            return False
    
    def stop_service(self) -> bool:
        """Stop the Windows Service"""
        if sys.platform != "win32":
            print("Error: Windows Service can only be stopped on Windows")
            return False
            
        try:
            win32serviceutil.StopService(self.service_name)
            print(f"Service '{self.service_name}' stopped successfully")
            return True
            
        except Exception as e:
            print(f"Error stopping service: {e}")
            logger.error(f"Service stop failed: {e}")
            return False
    
    def get_service_status(self) -> Optional[str]:
        """Get the current service status"""
        if sys.platform != "win32":
            return None
            
        try:
            status_info = win32serviceutil.QueryServiceStatus(self.service_name)
            status_code = status_info[1]
            
            status_map = {
                win32service.SERVICE_STOPPED: "STOPPED",
                win32service.SERVICE_START_PENDING: "START_PENDING",
                win32service.SERVICE_STOP_PENDING: "STOP_PENDING",
                win32service.SERVICE_RUNNING: "RUNNING",
                win32service.SERVICE_CONTINUE_PENDING: "CONTINUE_PENDING",
                win32service.SERVICE_PAUSE_PENDING: "PAUSE_PENDING",
                win32service.SERVICE_PAUSED: "PAUSED"
            }
            
            return status_map.get(status_code, "UNKNOWN")
            
        except Exception as e:
            logger.error(f"Error getting service status: {e}")
            return None
    
    def is_service_running(self) -> bool:
        """Check if the service is currently running"""
        status = self.get_service_status()
        return status == "RUNNING"
    
    def get_service_logs(self, lines: int = 50) -> Optional[str]:
        """Get recent service log entries"""
        try:
            log_file = self.log_dir / "service.log"
            
            if not log_file.exists():
                return "No service log file found"
                
            # Read last N lines from log file
            with open(log_file, 'r', encoding='utf-8') as f:
                all_lines = f.readlines()
                recent_lines = all_lines[-lines:] if len(all_lines) > lines else all_lines
                
            return ''.join(recent_lines)
            
        except Exception as e:
            logger.error(f"Error reading service logs: {e}")
            return f"Error reading logs: {e}"
    
    def cleanup_service_data(self) -> bool:
        """Clean up service data directories"""
        try:
            import shutil
            
            if self.service_dir.exists():
                # Remove all data except logs
                for item in self.service_dir.iterdir():
                    if item.name != 'logs' and item.is_dir():
                        shutil.rmtree(item)
                    elif item.is_file() and item.suffix not in ['.log']:
                        item.unlink()
                        
                print("Service data cleaned up (logs preserved)")
                return True
                
        except Exception as e:
            print(f"Error cleaning service data: {e}")
            logger.error(f"Service data cleanup failed: {e}")
            
        return False


def main():
    """Command-line interface for service management"""
    if sys.platform != "win32":
        print("Error: Windows Service management requires Windows")
        sys.exit(1)
        
    installer = ServiceInstaller()
    
    if len(sys.argv) < 2:
        print("EdgePulse Windows Service Manager")
        print("Usage:")
        print("  python -m edgepulse_win.windows_service install [python_exe]")
        print("  python -m edgepulse_win.windows_service uninstall")
        print("  python -m edgepulse_win.windows_service start")
        print("  python -m edgepulse_win.windows_service stop")
        print("  python -m edgepulse_win.windows_service status")
        print("  python -m edgepulse_win.windows_service logs [lines]")
        print("  python -m edgepulse_win.windows_service cleanup")
        sys.exit(1)
    
    command = sys.argv[1].lower()
    
    if command == "install":
        python_exe = sys.argv[2] if len(sys.argv) > 2 else None
        success = installer.install_service(python_exe)
        if success:
            installer.create_directories()
            
    elif command == "uninstall":
        installer.uninstall_service()
        
    elif command == "start":
        installer.start_service()
        
    elif command == "stop":
        installer.stop_service()
        
    elif command == "status":
        status = installer.get_service_status()
        if status:
            print(f"Service status: {status}")
        else:
            print("Could not determine service status")
            
    elif command == "logs":
        lines = int(sys.argv[2]) if len(sys.argv) > 2 else 50
        logs = installer.get_service_logs(lines)
        print(logs)
        
    elif command == "cleanup":
        installer.cleanup_service_data()
        
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)


if __name__ == '__main__':
    main()
