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

AGENT_PATH = Path(__file__).parent.parent.parent
sys.path.insert(0, str(AGENT_PATH))

if sys.platform == "win32":
    import win32service
    import win32serviceutil
    import win32event
    import servicemanager
    import win32api
else:
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

from edgepulse.core.agent import EdgePulseAgent
from edgepulse.config.settings import AgentSettings
from edgepulse.utils.log_handler import get_logger

logger = get_logger(__name__)


class EdgePulseWindowsService(win32service.ServiceFramework):
    """EdgePulse Windows Service implementation"""

    _svc_name_ = "EdgePulseAgent"
    _svc_display_name_ = "EdgePulse Security Agent"
    _svc_description_ = (
        "EdgePulse AI-powered security monitoring and anomaly detection agent"
    )

    def __init__(self, args):
        win32service.ServiceFramework.__init__(self, args)
        self._stop_event = win32event.CreateEvent(None, 0, 0, None)
        self._agent: EdgePulseAgent | None = None
        self._agent_task = None
        self._shutdown_event = None

        logger.info("EdgePulse Windows Service initialized")

    def SvcStop(self):
        """Stop the service (called by Windows Service Control Manager)"""
        logger.info("EdgePulse Windows Service stop requested")
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)

        win32event.SetEvent(self._stop_event)

        if self._agent and self._shutdown_event:
            self._shutdown_event.set()

        if self._agent_task:
            try:
                self._agent_task.wait(timeout=30)
            except Exception:
                logger.warning("Agent shutdown timeout, forcing stop")

        logger.info("EdgePulse Windows Service stopped")

    def SvcDoRun(self):
        """Main service execution (called by Windows Service Control Manager)"""
        try:
            logger.info("EdgePulse Windows Service starting...")
            self.ReportServiceStatus(win32service.SERVICE_START_PENDING)

            asyncio.run(self._run_agent())

        except Exception as e:
            logger.error(f"Service failed to start: {e}")
            self.ReportServiceStatus(win32service.SERVICE_STOPPED)
            raise

    async def _run_agent(self):
        """Run the EdgePulse agent with proper service integration"""
        try:
            self.ReportServiceStatus(win32service.SERVICE_RUNNING)
            logger.info("EdgePulse Windows Service is running")

            settings = AgentSettings(
                environment="production",
            )

            self._agent = EdgePulseAgent(settings=settings)
            self._shutdown_event = self._agent._shutdown_event

            await self._agent.initialize()

            self._agent_task = asyncio.create_task(self._agent.run_forever())

            while True:
                stop_result = win32event.WaitForSingleObject(self._stop_event, 1000)

                if stop_result == 0:
                    logger.info("Stop event received, shutting down...")
                    break

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
            if self._agent:
                try:
                    await self._agent.stop()
                except Exception as e:
                    logger.error(f"Agent stop error: {e}")

    def _get_device_id(self) -> str:
        """Get or generate device ID for service"""
        try:
            import uuid

            device_id_file = Path(r"C:\ProgramData\EdgePulse\device_id")

            if device_id_file.exists():
                device_id = device_id_file.read_text().strip()
                if device_id:
                    return device_id

            device_id = str(uuid.uuid4())
            device_id_file.parent.mkdir(exist_ok=True)
            device_id_file.write_text(device_id)

            logger.info(f"Generated device ID: {device_id}")
            return device_id

        except Exception as e:
            logger.error(f"Failed to get/generate device ID: {e}")
            return "edgepulse-service-unknown"


def setup_service_logging():
    """Setup logging for Windows Service"""
    try:
        import logging

        log_dir = Path(r"C:\ProgramData\EdgePulse\logs")
        log_dir.mkdir(parents=True, exist_ok=True)

        log_file = log_dir / "service.log"

        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            handlers=[
                logging.FileHandler(log_file),
                logging.StreamHandler(),
            ],
        )

        logger.info("Service logging configured")

    except Exception as e:
        print(f"Failed to setup service logging: {e}")


def handle_signals():
    """Handle system signals for graceful shutdown"""
    def signal_handler(signum, frame):
        logger.info(f"Received signal {signum}, shutting down...")

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)


def main():
    """Main entry point for Windows Service"""
    try:
        if len(sys.argv) > 1 and sys.argv[1] == "--service-mode":
            setup_service_logging()
            handle_signals()
            win32serviceutil.HandleCommandLine(EdgePulseWindowsService)
        else:
            print("EdgePulse Service – Console Mode")
            print("Use --service-mode to run as Windows Service")

            setup_service_logging()

            service = EdgePulseWindowsService(None)

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