"""UI transcript mirror for deck chat (durable even when checkpointer read fails)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ChatMessage, ChatThread, Deck
from app.schemas import ChatMessageOut


def ensure_chat_thread(db: Session, deck_id: int) -> ChatThread:
    thread = db.scalar(select(ChatThread).where(ChatThread.deck_id == deck_id))
    if thread is None:
        thread = ChatThread(deck_id=deck_id)
        db.add(thread)
        db.flush()
    return thread


def append_chat_turn(
    db: Session,
    deck: Deck,
    *,
    user_content: str,
    assistant_content: str,
    patch_applied: bool = False,
    patch_error: str | None = None,
) -> None:
    thread = ensure_chat_thread(db, deck.id)
    db.add(ChatMessage(thread_id=thread.id, role="user", content=user_content))
    db.add(
        ChatMessage(
            thread_id=thread.id,
            role="assistant",
            content=assistant_content or "（无文本回复）",
            patch_applied=patch_applied,
            patch_error=patch_error,
        )
    )
    db.commit()


def load_transcript(db: Session, deck_id: int) -> list[ChatMessageOut]:
    thread = db.scalar(select(ChatThread).where(ChatThread.deck_id == deck_id))
    if thread is None:
        return []
    rows = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.thread_id == thread.id)
        .order_by(ChatMessage.id.asc())
    ).all()
    return [
        ChatMessageOut(
            id=m.id,
            role=m.role if m.role in ("user", "assistant", "system") else "assistant",
            content=m.content,
            patch_applied=bool(m.patch_applied),
            patch_error=m.patch_error,
            created_at=m.created_at,
        )
        for m in rows
        if m.role in ("user", "assistant")
    ]
