"""
Windows Service Implementation for EdgePulse

This service wraps portable AgentCore and manages its lifecycle
as a proper Windows Service under LocalSystem.
"""

import sys
import threading
import asyncio

if sys.platform == "win32":
    import win32serviceutil
    import win32service
    import win32event
    import servicemanager
else:
    # Fallback stubs for non-Windows platforms (tests, CI, Linux/macOS)
    class win32serviceutil:
        @staticmethod
        def HandleCommandLine(cls):
            pass

    class win32service:
        class ServiceFramework:
            pass

    class win32event:
        @staticmethod
        def CreateEvent(secAttr, bManualReset, bInitialState, name):
            return None

        @staticmethod
        def WaitForSingleObject(handle, milliseconds):
            return win32event.WAIT_OBJECT_0

        WAIT_OBJECT_0 = 0
        INFINITE = -1

    class servicemanager:
        @staticmethod
        def LogMsg(msgType, msg):
            print(f"Service Log: {msg}")

        @staticmethod
        def StartService():
            pass

        @staticmethod
        def LogInfo(msg):
            print(f"Service Info: {msg}")

        @staticmethod
        def LogErrorMsg(msg):
            print(f"Service Error: {msg}")

        EVENTLOG_INFORMATION_TYPE = 0
        EVENTLOG_ERROR_TYPE = 1

from edgepulse.utils.log_handler import get_logger

logger = get_logger(__name__)


class EdgePulseWindowsService(win32service.ServiceFramework):
    """Windows Service implementation for EdgePulse Agent"""

    def __init__(
        self,
        service_name: str,
        service_display_name: str,
        service_description: str,
        agent_wrapper,
    ):
        self._service_name = service_name
        self._service_display_name = service_display_name
        self._service_description = service_description
        self._agent_wrapper = agent_wrapper

        win32service.ServiceFramework.__init__(self, service_name)

        self._is_running = False
        self._stop_event = None
        self._agent_task = None
        self._agent_thread = None

        self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)

        logger.info(f"Windows Service initialized: {service_name}")

    def SvcStop(self):
        """Stop service"""
        try:
            logger.info("Windows Service stop requested")
            self._is_running = False

            if self.hWaitStop:
                win32event.SetEvent(self.hWaitStop)

            if self._agent_wrapper and self._agent_wrapper.agent_core:

                def stop_agent():
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    try:
                        loop.run_until_complete(self._agent_wrapper.agent_core.stop())
                    finally:
                        loop.close()

                stop_thread = threading.Thread(target=stop_agent)
                stop_thread.start()
                stop_thread.join(timeout=10)

            servicemanager.LogInfo("Windows Service stopped")

        except Exception as e:
            logger.error(f"Error stopping service: {e}")
            servicemanager.LogErrorMsg(f"Service stop error: {e}")

    def SvcDoRun(self):
        """Main service execution"""
        try:
            logger.info("Windows Service starting")
            self._is_running = True

            servicemanager.LogInfo(f"EdgePulse Service starting: {self._service_name}")

            self._start_agent_thread()

            win32event.WaitForSingleObject(self.hWaitStop, win32event.INFINITE)

            logger.info("Windows Service stopped")

        except Exception as e:
            logger.error(f"Error in service execution: {e}")
            servicemanager.LogErrorMsg(f"Service execution error: {e}")

    def _start_agent_thread(self):
        """Start agent in a separate thread"""

        def run_agent():
            try:
                loop = asyncio.new_event_loop()
                asyncio.set_event_loop(loop)

                loop.run_until_complete(self._agent_wrapper.run_agent())

            except Exception as e:
                logger.error(f"Error in agent thread: {e}")
                servicemanager.LogErrorMsg(f"Agent thread error: {e}")
            finally:
                loop.close()
                self._is_running = False

        self._agent_thread = threading.Thread(target=run_agent, daemon=True)
        self._agent_thread.start()

        logger.info("Agent thread started")

    def SvcShutdown(self):
        """Service shutdown"""
        logger.info("Windows Service shutdown")
        self.SvcStop()

if sys.platform == "win32":

    def RegisterService(service_name, service_display_name, service_description):
        """Register service with Windows"""
        try:
            win32serviceutil.InstallService(
                service_name,
                service_display_name,
                service_description,
                startType=win32service.SERVICE_AUTO_START,
            )
            logger.info(f"Service registered: {service_name}")
            return True
        except Exception as e:
            logger.error(f"Error registering service: {e}")
            return False

    def UnregisterService(service_name):
        """Unregister service from Windows"""
        try:
            win32serviceutil.RemoveService(service_name)
            logger.info(f"Service unregistered: {service_name}")
            return True
        except Exception as e:
            logger.error(f"Error unregistering service: {e}")
            return False