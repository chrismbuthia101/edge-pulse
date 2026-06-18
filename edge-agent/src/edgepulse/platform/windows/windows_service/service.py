import asyncio
import sys
import threading
from typing import TYPE_CHECKING

if TYPE_CHECKING or sys.platform == "win32":
    import servicemanager
    import win32event
    import win32service

from edgepulse.utils.log_handler import get_logger

logger = get_logger(__name__)

_agent_wrapper = None


def set_agent_wrapper(wrapper) -> None:
    global _agent_wrapper
    _agent_wrapper = wrapper


class EdgePulseWindowsService(win32service.ServiceFramework):

    _svc_name_ = "EdgePulseAgent"
    _svc_display_name_ = "EdgePulse Monitoring Agent"
    _svc_description_ = "EdgePulse anomaly detection and monitoring agent for edge devices"

    def __init__(self, args):
        win32service.ServiceFramework.__init__(self, args)
        self._agent_wrapper = _agent_wrapper
        self._is_running = False
        self._agent_thread: threading.Thread | None = None
        self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
        logger.info("windows_service_initialized")

    def SvcStop(self):
        logger.info("windows_service_stop_requested")
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        self._is_running = False
        win32event.SetEvent(self.hWaitStop)

        if self._agent_wrapper and self._agent_wrapper.agent:

            def stop_agent():
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                try:
                    loop.run_until_complete(self._agent_wrapper.agent.stop())
                finally:
                    loop.close()

            stop_thread = threading.Thread(target=stop_agent, daemon=True)
            stop_thread.start()
            stop_thread.join(timeout=10)

        servicemanager.LogInfo("EdgePulse service stopped")
        logger.info("windows_service_stopped")

    def SvcDoRun(self):
        logger.info("windows_service_starting")
        self.ReportServiceStatus(win32service.SERVICE_START_PENDING)
        self._is_running = True
        servicemanager.LogInfo(f"EdgePulse service starting: {self._svc_display_name_}")
        self.ReportServiceStatus(win32service.SERVICE_RUNNING)

        self._start_agent_thread()
        win32event.WaitForSingleObject(self.hWaitStop, win32event.INFINITE)
        logger.info("windows_service_finished")

    def SvcShutdown(self):
        logger.info("windows_service_shutdown")
        self.SvcStop()

    def _start_agent_thread(self):
        def run_agent():
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)
                loop.run_until_complete(self._agent_wrapper.run_agent())
            except Exception as e:
                logger.error("windows_agent_thread_error", error=str(e))
                servicemanager.LogErrorMsg(f"Agent thread error: {e}")
            finally:
                loop.close()
                self._is_running = False

        self._agent_thread = threading.Thread(target=run_agent, daemon=True)
        self._agent_thread.start()
        logger.info("windows_agent_thread_started")
