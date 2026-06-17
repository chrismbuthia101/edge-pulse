import logging

logger = logging.getLogger(__name__)


def get_agent_version() -> str:
    try:
        from importlib.metadata import version

        return version("edge-agent")
    except Exception as e:
        logger.debug("Could not get version from importlib.metadata: %s", e)
    return "unknown"
