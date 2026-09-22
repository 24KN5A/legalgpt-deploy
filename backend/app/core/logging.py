"""
Centralized logging configuration using loguru.

Import `logger` from this module everywhere instead of using print()
or the stdlib logging module directly.
"""
import sys

from loguru import logger

from app.config import settings

_configured = False


def configure_logging() -> None:
    global _configured
    if _configured:
        return

    logger.remove()

    # Console sink
    logger.add(
        sys.stdout,
        level="DEBUG" if settings.debug else "INFO",
        colorize=True,
        format=(
            "<green>{time:YYYY-MM-DD HH:mm:ss}</green> | "
            "<level>{level: <8}</level> | "
            "<cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - "
            "<level>{message}</level>"
        ),
    )

    # Rotating file sink
    logger.add(
        settings.log_dir / "legalgpt.log",
        level="INFO",
        rotation="10 MB",
        retention="14 days",
        compression="zip",
        enqueue=True,
        backtrace=False,
        diagnose=False,
    )

    # Dedicated error file sink
    logger.add(
        settings.log_dir / "errors.log",
        level="ERROR",
        rotation="10 MB",
        retention="30 days",
        compression="zip",
        enqueue=True,
    )

    _configured = True


configure_logging()

__all__ = ["logger", "configure_logging"]
