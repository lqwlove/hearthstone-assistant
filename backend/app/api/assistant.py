from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.models import Card, ChatMessage, ChatThread, User
from app.schemas import ChatHistoryResponse, ChatMessageOut, ChatSendRequest, ChatSendResponse
from app.security import get_current_user
from app.services.deck_patch import apply_deck_patch, extract_patch
from app.services.decks import get_owned_deck, serialize_deck
from app.services.llm import LlmError, generate_assistant_reply

router = APIRouter(prefix="/decks/{deck_id}/chat", tags=["assistant"])


def _get_or_create_thread(db: Session, deck_id: int) -> ChatThread:
    thread = db.scalar(select(ChatThread).where(ChatThread.deck_id == deck_id))
    if thread is None:
        thread = ChatThread(deck_id=deck_id)
        db.add(thread)
        db.commit()
        db.refresh(thread)
    return thread


@router.get("", response_model=ChatHistoryResponse)
def get_history(
    deck_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> ChatHistoryResponse:
    get_owned_deck(db, user, deck_id)
    thread = _get_or_create_thread(db, deck_id)
    messages = db.scalars(
        select(ChatMessage).where(ChatMessage.thread_id == thread.id).order_by(ChatMessage.id.asc())
    ).all()
    return ChatHistoryResponse(
        thread_id=thread.id,
        messages=[ChatMessageOut.model_validate(m) for m in messages],
    )


@router.post("", response_model=ChatSendResponse)
async def send_message(
    deck_id: int,
    body: ChatSendRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ChatSendResponse:
    deck = get_owned_deck(db, user, deck_id)
    thread = _get_or_create_thread(db, deck_id)

    user_msg = ChatMessage(thread_id=thread.id, role="user", content=body.content)
    db.add(user_msg)
    db.commit()

    history_rows = db.scalars(
        select(ChatMessage)
        .where(ChatMessage.thread_id == thread.id, ChatMessage.id != user_msg.id)
        .order_by(ChatMessage.id.asc())
    ).all()
    history = [{"role": m.role, "content": m.content} for m in history_rows if m.role in ("user", "assistant")]

    # Build deck context for the model
    lines = [
        f"deck_name={deck.name}",
        f"class={deck.class_slug}",
        f"format={deck.format}",
        f"status={deck.status}",
        "current_cards:",
    ]
    for dc in deck.cards:
        name = dc.card.name if dc.card else dc.card_id
        lines.append(f"- {dc.card_id} {name} x{dc.count}")
    sample = db.scalar(
        select(Card)
        .where(Card.collectible.is_(True), Card.class_slug.in_([deck.class_slug, "neutral"]))
        .limit(1)
    )
    if sample:
        lines.append(f"sample_card_id={sample.id}")
    deck_context = "\n".join(lines)

    try:
        reply_text = await generate_assistant_reply(settings, history[-20:], body.content, deck_context)
    except LlmError as exc:
        # Keep user message; surface error without assistant row loss of deck
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    patch_applied = False
    patch_error: str | None = None
    patch = extract_patch(reply_text)
    if patch is not None:
        applied, err = apply_deck_patch(db, deck, patch)
        patch_applied = applied
        patch_error = err
        db.refresh(deck)

    assistant_msg = ChatMessage(
        thread_id=thread.id,
        role="assistant",
        content=reply_text,
        patch_applied=patch_applied,
        patch_error=patch_error,
    )
    db.add(assistant_msg)
    db.commit()
    db.refresh(assistant_msg)
    db.refresh(user_msg)

    return ChatSendResponse(
        messages=[ChatMessageOut.model_validate(user_msg), ChatMessageOut.model_validate(assistant_msg)],
        deck=serialize_deck(deck) if patch_applied else serialize_deck(deck),
        patch_applied=patch_applied,
        patch_error=patch_error,
    )
