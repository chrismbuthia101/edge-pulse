"""
Windows Service Installer for EdgePulse

Provides installation, removal, and management of EdgePulse Windows Service.
Implements proper LocalSystem configuration and auto-start behavior.
"""

import sys
import os
import time
from pathlib import Path
from typing import Optional, Dict, Any

# Windows-specific imports
if sys.platform == "win32":
    import win32serviceutil
    import win32service
    import win32event
    import servicemanager
    import win32api
    import win32con
    import win32security
    import ntsecuritycon
else:
    raise ImportError("Windows Service installer only works on Windows")

from edgepulse.utils.log_handler import get_logger
from edgepulse.platform._paths import _safe_program_data

logger = get_logger(__name__)

# Service configuration constants
SERVICE_NAME = "EdgePulseAgent"
SERVICE_DISPLAY_NAME = "EdgePulse Security Agent"
SERVICE_DESCRIPTION = "EdgePulse AI-powered security monitoring and anomaly detection agent"
SERVICE_EXECUTABLE = "python.exe"
SERVICE_SCRIPT = "service_main.py"

# Service account configuration
SERVICE_ACCOUNT = "LocalSystem"
SERVICE_START_TYPE = win32service.SERVICE_AUTO_START


class EdgePulseServiceInstaller:
    """Windows Service installer and manager"""
    
    def __init__(self, agent_path: Optional[str] = None):
        self.agent_path = Path(agent_path) if agent_path else Path(__file__).parent.parent.parent
        self.service_script_path = self.agent_path / "windows_service" / SERVICE_SCRIPT
        self.python_executable = sys.executable
        
        logger.info(f"Service installer initialized for path: {self.agent_path}")
    
    def verify_prerequisites(self) -> bool:
        """Verify all prerequisites for service installation"""
        try:
            # Check if running as Administrator
            if not self._is_admin():
                logger.error("Service installation requires Administrator privileges")
                return False
            
            # Verify Python executable
            if not os.path.exists(self.python_executable):
                logger.error(f"Python executable not found: {self.python_executable}")
                return False
            
            # Verify service script exists
            if not self.service_script_path.exists():
                logger.error(f"Service script not found: {self.service_script_path}")
                return False
            
            # Verify required modules
            try:
                import pywin32
                import win32service
                import win32serviceutil
            except ImportError as e:
                logger.error(f"Required Windows modules missing: {e}")
                return False
            
            logger.info("Prerequisites verification passed")
            return True
            
        except Exception as e:
            logger.error(f"Prerequisite verification failed: {e}")
            return False
    
    def _is_admin(self) -> bool:
        """Check if running with Administrator privileges"""
        try:
            return win32api.OpenProcessToken(
                win32api.GetCurrentProcess(),
                win32con.TOKEN_QUERY,
                win32security.TOKEN_DUPLICATE
            ) is not None
        except:
            return False
    
    def install_service(self) -> bool:
        """Install EdgePulse Windows Service"""
        try:
            if not self.verify_prerequisites():
                return False
            
            logger.info("Installing EdgePulse Windows Service...")
            
            # Build service command
            service_cmd = [
                self.python_executable,
                str(self.service_script_path),
                "--service-mode"
            ]
            
            # Install service using win32serviceutil
            win32serviceutil.InstallService(
                pythonArgs=service_cmd,
                serviceName=SERVICE_NAME,
                displayName=SERVICE_DISPLAY_NAME,
                description=SERVICE_DESCRIPTION,
                startType=SERVICE_START_TYPE,
                bRunInteractive=0,  # Run as service, not interactive
                userName=SERVICE_ACCOUNT,
                password=None,  # LocalSystem doesn't need password
                dependencies=None
            )
            
            # Configure service permissions
            self._configure_service_permissions()
            
            # Set service to auto-start
            self._set_service_auto_start()
            
            logger.info(f"Service '{SERVICE_NAME}' installed successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to install service: {e}")
            return False
    
    def _configure_service_permissions(self):
        """Configure service permissions for LocalSystem"""
        try:
            # Grant necessary permissions to service executable
            service_exe_path = self.python_executable
            
            # Get security descriptor
            sd = win32security.GetFileSecurity(
                service_exe_path,
                win32security.DACL_SECURITY_INFORMATION
            )
            
            # Create new DACL with LocalSystem permissions
            dacl = sd.GetSecurityDescriptorDacl()
            if dacl is None:
                dacl = win32security.ACL()
            
            # Add LocalSystem full control
            sid_system = win32security.LookupAccountName("", "SYSTEM")[0]
            dacl.AddAccessAllowedAce(
                win32security.ACL_REVISION,
                win32con.GENERIC_ALL,
                sid_system
            )
            
            # Set new security descriptor
            sd.SetSecurityDescriptorDacl(1, dacl, 0)
            win32security.SetFileSecurity(
                service_exe_path,
                win32security.DACL_SECURITY_INFORMATION,
                sd
            )
            
            logger.info("Service permissions configured")
            
        except Exception as e:
            logger.warning(f"Failed to configure service permissions: {e}")
    
    def _set_service_auto_start(self):
        """Configure service to start automatically"""
        try:
            # Open service manager
            scm = win32service.OpenSCManager(
                None, None, win32service.SC_MANAGER_ALL_ACCESS
            )
            
            # Open service
            service = win32service.OpenService(
                scm, SERVICE_NAME, win32service.SERVICE_ALL_ACCESS
            )
            
            # Set start type to auto
            win32service.ChangeServiceConfig(
                service,
                win32service.SERVICE_NO_CHANGE,
                win32service.SERVICE_AUTO_START,
                win32service.SERVICE_NO_CHANGE,
                None, None, None, None, None, None, None
            )
            
            # Close handles
            win32service.CloseServiceHandle(service)
            win32service.CloseServiceHandle(scm)
            
            logger.info("Service configured for auto-start")
            
        except Exception as e:
            logger.warning(f"Failed to configure auto-start: {e}")
    
    def uninstall_service(self) -> bool:
        """Uninstall EdgePulse Windows Service"""
        try:
            logger.info("Uninstalling EdgePulse Windows Service...")
            
            # Stop service if running
            self.stop_service()
            
            # Remove service
            if win32serviceutil.QueryServiceStatus(SERVICE_NAME)[1] != win32service.SERVICE_STOPPED:
                win32serviceutil.StopService(SERVICE_NAME)
                time.sleep(2)  # Wait for service to stop
            
            win32serviceutil.RemoveService(SERVICE_NAME)
            
            logger.info(f"Service '{SERVICE_NAME}' uninstalled successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to uninstall service: {e}")
            return False
    
    def start_service(self) -> bool:
        """Start EdgePulse Windows Service"""
        try:
            logger.info("Starting EdgePulse Windows Service...")
            
            win32serviceutil.StartService(SERVICE_NAME)
            
            # Wait for service to start
            for _ in range(10):  # Wait up to 10 seconds
                status = win32serviceutil.QueryServiceStatus(SERVICE_NAME)[1]
                if status == win32service.SERVICE_RUNNING:
                    logger.info("Service started successfully")
                    return True
                time.sleep(1)
            
            logger.error("Service failed to start within timeout")
            return False
            
        except Exception as e:
            logger.error(f"Failed to start service: {e}")
            return False
    
    def stop_service(self) -> bool:
        """Stop EdgePulse Windows Service"""
        try:
            logger.info("Stopping EdgePulse Windows Service...")
            
            win32serviceutil.StopService(SERVICE_NAME)
            
            # Wait for service to stop
            for _ in range(10):  # Wait up to 10 seconds
                status = win32serviceutil.QueryServiceStatus(SERVICE_NAME)[1]
                if status == win32service.SERVICE_STOPPED:
                    logger.info("Service stopped successfully")
                    return True
                time.sleep(1)
            
            logger.error("Service failed to stop within timeout")
            return False
            
        except Exception as e:
            logger.error(f"Failed to stop service: {e}")
            return False
    
    def restart_service(self) -> bool:
        """Restart EdgePulse Windows Service"""
        logger.info("Restarting EdgePulse Windows Service...")
        
        if not self.stop_service():
            return False
        
        time.sleep(2)  # Brief pause
        return self.start_service()
    
    def get_service_status(self) -> Dict[str, Any]:
        """Get current service status"""
        try:
            status_code, win32_error = win32serviceutil.QueryServiceStatus(SERVICE_NAME)
            
            status_map = {
                win32service.SERVICE_STOPPED: "STOPPED",
                win32service.SERVICE_START_PENDING: "STARTING",
                win32service.SERVICE_STOP_PENDING: "STOPPING",
                win32service.SERVICE_RUNNING: "RUNNING",
                win32service.SERVICE_CONTINUE_PENDING: "CONTINUING",
                win32service.SERVICE_PAUSE_PENDING: "PAUSING",
                win32service.SERVICE_PAUSED: "PAUSED"
            }
            
            status = status_map.get(status_code, "UNKNOWN")
            
            return {
                "service_name": SERVICE_NAME,
                "status": status,
                "status_code": status_code,
                "win32_error": win32_error,
                "is_installed": status_code is not None
            }
            
        except Exception as e:
            return {
                "service_name": SERVICE_NAME,
                "status": "NOT_INSTALLED",
                "status_code": None,
                "win32_error": str(e),
                "is_installed": False
            }
    
# CLI interface for service management
def main():
    """Command-line interface for service management"""
    import argparse
    
    parser = argparse.ArgumentParser(description="EdgePulse Windows Service Manager")
    parser.add_argument("action", choices=[
        "install", "uninstall", "start", "stop", "restart", "status"
    ], help="Service management action")
    parser.add_argument("--path", help="Agent installation path")
    
    args = parser.parse_args()
    
    installer = EdgePulseServiceInstaller(args.path)
    
    if args.action == "install":
        success = installer.install_service()
    elif args.action == "uninstall":
        success = installer.uninstall_service()
    elif args.action == "start":
        success = installer.start_service()
    elif args.action == "stop":
        success = installer.stop_service()
    elif args.action == "restart":
        success = installer.restart_service()
    elif args.action == "status":
        status = installer.get_service_status()
        print(f"Service Status: {status['status']}")
        return
    else:
        print(f"Unknown action: {args.action}")
        return
    
    if success:
        print(f"Service {args.action} completed successfully")
    else:
        print(f"Service {args.action} failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
