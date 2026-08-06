from __future__ import annotations

import logging
from typing import Any

from langgraph.checkpoint.memory import MemorySaver
from langgraph.store.memory import InMemoryStore

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

_checkpointer: Any = None
_store: Any = None
_pool: Any = None
_store_pool: Any = None
_setup_done = False


def _make_postgres_pool(conninfo: str):
    from psycopg.rows import dict_row
    from psycopg_pool import ConnectionPool

    return ConnectionPool(
        conninfo=conninfo,
        kwargs={"autocommit": True, "prepare_threshold": 0, "row_factory": dict_row},
        min_size=1,
        max_size=8,
        open=True,
        timeout=30,
        reconnect_timeout=60,
        max_idle=300,
    )


def ensure_agent_memory_ready(settings: Settings | None = None) -> tuple[Any, Any]:
    """Initialize checkpointer + store once. Returns (checkpointer, store)."""
    global _checkpointer, _store, _pool, _store_pool, _setup_done
    if _setup_done and _checkpointer is not None and _store is not None:
        return _checkpointer, _store

    settings = settings or get_settings()
    if settings.use_postgres_agent_memory:
        conninfo = settings.psycopg_conninfo
        if not conninfo:
            raise RuntimeError("AGENT_MEMORY_BACKEND=postgres but DATABASE_URL is not PostgreSQL")
        from langgraph.checkpoint.postgres import PostgresSaver
        from langgraph.store.postgres import PostgresStore

        _pool = _make_postgres_pool(conninfo)
        _store_pool = _make_postgres_pool(conninfo)
        _checkpointer = PostgresSaver(_pool)
        _store = PostgresStore(_store_pool)
        _checkpointer.setup()
        _store.setup()
        logger.info("Agent memory: Postgres checkpointer + store ready")
    else:
        _checkpointer = MemorySaver()
        _store = InMemoryStore()
        logger.info("Agent memory: in-memory checkpointer + store (tests/sqlite)")

    _setup_done = True
    return _checkpointer, _store


def get_checkpointer() -> Any:
    ensure_agent_memory_ready()
    return _checkpointer


def get_store() -> Any:
    ensure_agent_memory_ready()
    return _store


def reset_agent_memory_for_tests() -> None:
    """Reset singletons between tests (in-memory only)."""
    global _checkpointer, _store, _pool, _store_pool, _setup_done
    shutdown_agent_memory()
    _checkpointer = None
    _store = None
    _setup_done = False


def shutdown_agent_memory() -> None:
    global _pool, _store_pool
    for pool in (_pool, _store_pool):
        if pool is not None:
            try:
                pool.close()
            except Exception:  # noqa: BLE001
                logger.exception("Failed closing agent memory pool")
    _pool = None
    _store_pool = None
