"""
EdgePulse Linux Service Core

Provides the EdgePulseLinuxService class which manages the agent lifecycle
when running under systemd.
"""

import asyncio
import signal
import sys
import threading
from pathlib import Path
from typing import Optional

from edgepulse.utils.log_handler import get_logger

logger = get_logger(__name__)

SERVICE_NAME = "edgepulse-agent"
SERVICE_DISPLAY_NAME = "EdgePulse Monitoring Agent"
SERVICE_DESCRIPTION = (
    "EdgePulse AI-powered security monitoring and anomaly detection agent "
    "for Linux edge devices."
)


class EdgePulseLinuxService:

    def __init__(self, agent_wrapper) -> None:
        self._agent_wrapper = agent_wrapper
        self._is_running: bool = False
        self._shutdown_event: Optional[asyncio.Event] = None
        self._agent_thread: Optional[threading.Thread] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None

        logger.info("linux_service_initialized", service=SERVICE_NAME)

    # ── Public API ────────────────────────────────────────────────────────────

    @property
    def is_running(self) -> bool:
        return self._is_running

    def start(self) -> None:
        """Start the agent in a background thread (non-blocking)."""
        if self._is_running:
            logger.warning("linux_service_already_running")
            return

        self._is_running = True
        self._agent_thread = threading.Thread(
            target=self._run_agent_loop,
            name="edgepulse-agent-loop",
            daemon=True,
        )
        self._agent_thread.start()
        logger.info("linux_service_start_requested")

    def stop(self, timeout: float = 30.0) -> None:
        logger.info("linux_service_stop_requested")
        self._is_running = False

        # Wake the asyncio shutdown event from any thread
        if self._shutdown_event is not None and self._loop is not None:
            self._loop.call_soon_threadsafe(self._shutdown_event.set)

        if self._agent_thread is not None:
            self._agent_thread.join(timeout=timeout)
            if self._agent_thread.is_alive():
                logger.warning("linux_service_thread_did_not_exit", timeout=timeout)

        logger.info("linux_service_stopped")

    def run_sync(self) -> None:
        self.start()

        # Wait for SIGTERM / SIGINT or for the agent thread to exit naturally.
        try:
            if self._agent_thread is not None:
                self._agent_thread.join()
        except KeyboardInterrupt:
            logger.info("linux_service_keyboard_interrupt")
        finally:
            self.stop()

    # ── Internal ──────────────────────────────────────────────────────────────

    def _run_agent_loop(self) -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        self._loop = loop
        self._shutdown_event = asyncio.Event()

        self._register_signal_handlers(loop)

        try:
            loop.run_until_complete(self._run_agent_coroutine())
        except Exception as exc:
            logger.error("linux_service_agent_loop_error", error=str(exc))
        finally:
            try:
                # Cancel any lingering tasks
                pending = asyncio.all_tasks(loop)
                for task in pending:
                    task.cancel()
                if pending:
                    loop.run_until_complete(
                        asyncio.gather(*pending, return_exceptions=True)
                    )
            finally:
                loop.close()
                self._is_running = False
                logger.info("linux_service_event_loop_closed")

    async def _run_agent_coroutine(self) -> None:
        """Main agent coroutine: starts the wrapper, waits for shutdown."""
        assert self._shutdown_event is not None  # set in _run_agent_loop

        try:
            logger.info("linux_service_agent_starting")

            agent_task = asyncio.create_task(
                self._agent_wrapper.run_agent(),
                name="edgepulse-agent-task",
            )

            done, _ = await asyncio.wait(
                {agent_task, asyncio.create_task(self._shutdown_event.wait())},
                return_when=asyncio.FIRST_COMPLETED,
            )

            if not agent_task.done():
                if (
                    self._agent_wrapper is not None
                    and hasattr(self._agent_wrapper, "agent")
                    and self._agent_wrapper.agent is not None
                ):
                    try:
                        await self._agent_wrapper.agent.stop()
                    except Exception as exc:
                        logger.error("linux_service_agent_stop_error", error=str(exc))
                agent_task.cancel()
                try:
                    await agent_task
                except asyncio.CancelledError:
                    pass

        except asyncio.CancelledError:
            logger.info("linux_service_coroutine_cancelled")
        except Exception as exc:
            logger.error("linux_service_coroutine_error", error=str(exc))
        finally:
            logger.info("linux_service_agent_coroutine_finished")

    def _register_signal_handlers(self, loop: asyncio.AbstractEventLoop) -> None:
        def _request_shutdown(signum: int) -> None:
            sig_name = signal.Signals(signum).name
            logger.info("linux_service_signal_received", signal=sig_name)
            if self._shutdown_event is not None:
                loop.call_soon_threadsafe(self._shutdown_event.set)

        try:
            loop.add_signal_handler(
                signal.SIGTERM,
                lambda: _request_shutdown(signal.SIGTERM),
            )
            loop.add_signal_handler(
                signal.SIGINT,
                lambda: _request_shutdown(signal.SIGINT),
            )
            logger.debug("linux_service_signal_handlers_registered")
        except (NotImplementedError, RuntimeError) as exc:
            logger.warning(
                "linux_service_signal_handler_fallback",
                reason=str(exc),
            )

            def _fallback_handler(signum, frame):  # noqa: ANN001
                _request_shutdown(signum)

            signal.signal(signal.SIGTERM, _fallback_handler)
            signal.signal(signal.SIGINT, _fallback_handler)