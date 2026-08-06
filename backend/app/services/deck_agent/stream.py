from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from typing import Any

from langchain_core.messages import HumanMessage
from sqlalchemy.orm import Session

from app import database
from app.config import Settings, get_settings
from app.services.deck_agent.runtime import _create_agent, _message_text, thread_id_for
from app.services.deck_agent.transcript import append_chat_turn
from app.services.decks import get_owned_deck, serialize_deck

logger = logging.getLogger(__name__)


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, default=str)}\n\n"


def _emit_message_chunk(msg_chunk: Any, metadata: Any) -> Iterator[tuple[str, dict[str, Any]]]:
    node = (metadata or {}).get("langgraph_node")
    cls_name = msg_chunk.__class__.__name__
    msg_type = getattr(msg_chunk, "type", None)

    if cls_name in ("AIMessageChunk", "AIMessage") or msg_type in ("ai", "AIMessageChunk"):
        text = _message_text(getattr(msg_chunk, "content", ""))
        tool_call_chunks = getattr(msg_chunk, "tool_call_chunks", None) or []
        tool_calls = getattr(msg_chunk, "tool_calls", None) or []
        if text:
            yield "token", {"text": text, "node": node}
        for tc in list(tool_call_chunks) + list(tool_calls):
            if isinstance(tc, dict):
                name = tc.get("name")
                args = tc.get("args") or {}
                call_id = tc.get("id") or name
            else:
                name = getattr(tc, "name", None)
                args = getattr(tc, "args", {}) or {}
                call_id = getattr(tc, "id", None) or name
            if name:
                yield "tool_call", {
                    "id": call_id or name,
                    "name": name,
                    "args": args,
                    "status": "loading",
                }
        return

    if cls_name == "ToolMessage" or msg_type == "tool":
        name = getattr(msg_chunk, "name", None) or "tool"
        call_id = getattr(msg_chunk, "tool_call_id", None) or name
        out = _message_text(getattr(msg_chunk, "content", ""))
        yield "tool_result", {
            "id": call_id,
            "name": name,
            "output": out[:4000],
            "status": "error" if out.startswith("错误:") else "success",
        }


def iter_deck_agent_sse(
    *,
    user_id: int,
    deck_id: int,
    content: str,
    settings: Settings | None = None,
) -> Iterator[str]:
    """Yield SSE frames; opens its own DB session for thread-safety."""
    settings = settings or get_settings()
    db: Session = database.SessionLocal()
    try:
        # lightweight ownership check using a User-like id
        from app.models import User

        user = db.get(User, user_id)
        if user is None:
            yield _sse("error", {"message": "用户不存在"})
            return
        deck = get_owned_deck(db, user, deck_id)
        tid = thread_id_for(user_id, deck.id)
        agent = _create_agent(db, deck, settings)
        config = {"configurable": {"thread_id": tid}}
        cards_before = {(c.card_id, c.count) for c in deck.cards}
        patch_error: str | None = None
        seen_tool_results: set[str] = set()
        assistant_parts: list[str] = []

        yield _sse("status", {"message": "教练思考中…", "phase": deck.assistant_phase})

        try:
            for item in agent.stream(
                {"messages": [HumanMessage(content=content)]},
                config=config,
                stream_mode="messages",
            ):
                # stream_mode=messages → (message, metadata)
                if isinstance(item, tuple) and len(item) == 2:
                    msg_chunk, metadata = item
                else:
                    msg_chunk, metadata = item, {}
                for event, data in _emit_message_chunk(msg_chunk, metadata):
                    if event == "token":
                        assistant_parts.append(str(data.get("text") or ""))
                    if event == "tool_result":
                        key = f"{data.get('id')}:{data.get('output')}"
                        if key in seen_tool_results:
                            continue
                        seen_tool_results.add(key)
                        if str(data.get("output", "")).startswith("错误:"):
                            patch_error = str(data["output"]).removeprefix("错误:").strip()
                    yield _sse(event, data)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Agent stream failed")
            yield _sse("error", {"message": str(exc)})
            return

        db.refresh(deck)
        cards_after = {(c.card_id, c.count) for c in deck.cards}
        patch_applied = cards_before != cards_after and not patch_error
        phase = deck.assistant_phase if deck.assistant_phase in ("coaching", "building") else "coaching"
        assistant_text = "".join(assistant_parts).strip() or "（无文本回复）"
        try:
            append_chat_turn(
                db,
                deck,
                user_content=content,
                assistant_content=assistant_text,
                patch_applied=patch_applied,
                patch_error=patch_error,
            )
        except Exception:  # noqa: BLE001
            logger.exception("Failed mirroring streamed chat turn to transcript")
        yield _sse(
            "done",
            {
                "phase": phase,
                "patch_applied": patch_applied,
                "patch_error": patch_error,
                "deck": serialize_deck(deck).model_dump(mode="json"),
                "thread_id": tid,
            },
        )
    finally:
        db.close()
