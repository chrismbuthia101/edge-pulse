"""
EdgePulse Windows Service Main Entry Point

This script runs the EdgePulse agent as a proper Windows Service.
Implements SvcDoRun, SvcStop, and graceful shutdown handling.
"""

import sys
import asyncio
import threading
import signal
from pathlib import Path

# Add agent path to Python path
AGENT_PATH = Path(__file__).parent.parent.parent
sys.path.insert(0, str(AGENT_PATH))

# Windows-specific imports
if sys.platform == "Windows":
    import win32service
    import win32serviceutil
    import win32event
    import servicemanager
    import win32api
else:
    # Fallback for non-Windows platforms
    class win32service:
        class ServiceFramework:
            pass
    
    class win32serviceutil:
        @staticmethod
        def HandleCommandLine(cls):
            pass
    
    class win32event:
        @staticmethod
        def CreateEvent(secAttr, manualReset, initialState, name):
            return threading.Event()
        
        @staticmethod
        def WaitForSingleObject(handle, milliseconds):
            return 0 if handle.is_set() else -1

from edgepulse_win.agent_core import EdgePulseAgent
from edgepulse_win.utils.log_handler import get_logger

logger = get_logger(__name__)


class EdgePulseWindowsService(win32service.ServiceFramework):
    """EdgePulse Windows Service implementation"""
    
    _svc_name_ = "EdgePulseAgent"
    _svc_display_name_ = "EdgePulse Security Agent"
    _svc_description_ = "EdgePulse AI-powered security monitoring and anomaly detection agent"
    
    def __init__(self, args):
        win32service.ServiceFramework.__init__(self, args)
        self._stop_event = win32event.CreateEvent(None, 0, 0, None)
        self._agent = None
        self._agent_task = None
        self._shutdown_event = None
        
        # Setup logging for service
        logger.info("EdgePulse Windows Service initialized")
    
    def SvcStop(self):
        """Stop the service (called by Windows Service Control Manager)"""
        logger.info("EdgePulse Windows Service stop requested")
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        
        # Set stop event to signal shutdown
        win32event.SetEvent(self._stop_event)
        
        # Graceful shutdown of agent
        if self._agent and self._shutdown_event:
            self._shutdown_event.set()
        
        # Wait for agent to stop
        if self._agent_task:
            try:
                # Give agent time to shutdown gracefully
                self._agent_task.wait(timeout=30)
            except (asyncio.TimeoutError, Exception):
                logger.warning("Agent shutdown timeout, forcing stop")
        
        logger.info("EdgePulse Windows Service stopped")
    
    def SvcDoRun(self):
        """Main service execution (called by Windows Service Control Manager)"""
        try:
            logger.info("EdgePulse Windows Service starting...")
            self.ReportServiceStatus(win32service.SERVICE_START_PENDING)
            
            # Run agent in asyncio event loop
            asyncio.run(self._run_agent())
            
        except Exception as e:
            logger.error(f"Service failed to start: {e}")
            self.ReportServiceStatus(win32service.SERVICE_STOPPED)
            raise
    
    async def _run_agent(self):
        """Run the EdgePulse agent with proper service integration"""
        try:
            # Report service as running
            self.ReportServiceStatus(win32service.SERVICE_RUNNING)
            logger.info("EdgePulse Windows Service is running")
            
            # Initialize agent
            config = {
                'device_id': self._get_device_id(),
                'service_mode': True,
                'log_to_file': True,
                'log_file_path': r"C:\ProgramData\EdgePulse\service.log"
            }
            
            self._agent = EdgePulseAgent(config)
            self._shutdown_event = self._agent._shutdown_event
            
            # Start agent
            await self._agent.initialize()
            
            # Run agent in background task
            self._agent_task = asyncio.create_task(self._agent.run_forever())
            
            # Wait for stop event
            while True:
                # Check for stop event from service manager
                stop_result = win32event.WaitForSingleObject(self._stop_event, 1000)
                
                if stop_result == 0:  # Stop event set
                    logger.info("Stop event received, shutting down...")
                    break
                
                # Check if agent task completed (should not happen normally)
                if self._agent_task.done():
                    try:
                        result = self._agent_task.result()
                        logger.info(f"Agent completed: {result}")
                    except Exception as e:
                        logger.error(f"Agent task failed: {e}")
                    break
            
        except Exception as e:
            logger.error(f"Service execution error: {e}")
            self.ReportServiceStatus(win32service.SERVICE_STOPPED)
            raise
        finally:
            # Ensure cleanup
            if self._agent:
                try:
                    await self._agent.stop()
                except Exception as e:
                    logger.error(f"Agent stop error: {e}")
    
    def _get_device_id(self) -> str:
        """Get or generate device ID for service"""
        try:
            import uuid
            
            # Try to read existing device ID from registry or file
            device_id_file = Path(r"C:\ProgramData\EdgePulse\device_id")
            
            if device_id_file.exists():
                with open(device_id_file, 'r') as f:
                    device_id = f.read().strip()
                    if device_id:
                        return device_id
            
            # Generate new device ID
            device_id = str(uuid.uuid4())
            
            # Ensure directory exists
            device_id_file.parent.mkdir(exist_ok=True)
            
            # Save device ID
            with open(device_id_file, 'w') as f:
                f.write(device_id)
            
            logger.info(f"Generated device ID: {device_id}")
            return device_id
            
        except Exception as e:
            logger.error(f"Failed to get/generate device ID: {e}")
            return "edgepulse-service-unknown"


def setup_service_logging():
    """Setup logging for Windows Service"""
    try:
        import logging
        
        # Create service log directory
        log_dir = Path(r"C:\ProgramData\EdgePulse\logs")
        log_dir.mkdir(parents=True, exist_ok=True)
        
        # Setup file logging
        log_file = log_dir / "service.log"
        
        # Configure root logger
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_file),
                logging.StreamHandler()  # Also log to console for debugging
            ]
        )
        
        logger.info("Service logging configured")
        
    except Exception as e:
        print(f"Failed to setup service logging: {e}")


def handle_signals():
    """Handle system signals for graceful shutdown"""
    def signal_handler(signum, frame):
        logger.info(f"Received signal {signum}, shutting down...")
        # Signal will be handled by SvcStop
    
    # Register signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)


def main():
    """Main entry point for Windows Service"""
    try:
        # Check if running in service mode
        if len(sys.argv) > 1 and sys.argv[1] == "--service-mode":
            # Running as Windows Service
            setup_service_logging()
            handle_signals()
            
            # Handle service command line
            win32serviceutil.HandleCommandLine(EdgePulseWindowsService)
        else:
            # Running in console mode (for testing)
            print("EdgePulse Service - Console Mode")
            print("Use --service-mode to run as Windows Service")
            
            # Setup logging for console mode
            setup_service_logging()
            
            # Create and run service directly
            service = EdgePulseWindowsService(None)
            
            # Simulate service start
            print("Starting EdgePulse agent in console mode...")
            asyncio.run(service._run_agent())
            
    except KeyboardInterrupt:
        print("Service interrupted by user")
    except Exception as e:
        print(f"Service error: {e}")
        logger.error(f"Service error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
