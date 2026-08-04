from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.models import User
from app.schemas import (
    ChatHistoryResponse,
    ChatSendRequest,
    ChatSendResponse,
    PhaseResponse,
)
from app.security import get_current_user
from app.services.deck_agent import get_chat_history, run_deck_agent_turn, thread_id_for
from app.services.deck_agent.stream import iter_deck_agent_sse
from app.services.decks import get_owned_deck

router = APIRouter(prefix="/decks/{deck_id}/chat", tags=["assistant"])


@router.get("", response_model=ChatHistoryResponse)
def get_history(
    deck_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> ChatHistoryResponse:
    deck = get_owned_deck(db, user, deck_id)
    settings = get_settings()
    tid, messages = get_chat_history(db, deck, user.id, settings)
    return ChatHistoryResponse(
        thread_id=tid or thread_id_for(user.id, deck_id),
        messages=messages,
        phase=deck.assistant_phase if deck.assistant_phase in ("coaching", "building") else "coaching",
    )


@router.post("", response_model=ChatSendResponse)
def send_message(
    deck_id: int,
    body: ChatSendRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ChatSendResponse:
    deck = get_owned_deck(db, user, deck_id)
    messages, deck_out, patch_applied, patch_error = run_deck_agent_turn(
        db, deck, user.id, body.content, settings=settings
    )
    phase = deck.assistant_phase if deck.assistant_phase in ("coaching", "building") else "coaching"
    return ChatSendResponse(
        messages=messages,
        deck=deck_out,
        patch_applied=patch_applied,
        patch_error=patch_error,
        phase=phase,  # type: ignore[arg-type]
    )


@router.post("/stream")
def stream_message(
    deck_id: int,
    body: ChatSendRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> StreamingResponse:
    # Validate ownership before starting the stream
    get_owned_deck(db, user, deck_id)

    def event_iter():
        yield from iter_deck_agent_sse(
            user_id=user.id,
            deck_id=deck_id,
            content=body.content,
            settings=settings,
        )

    return StreamingResponse(
        event_iter(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/start-building", response_model=PhaseResponse)
def start_building(
    deck_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> PhaseResponse:
    deck = get_owned_deck(db, user, deck_id)
    deck.assistant_phase = "building"
    db.commit()
    db.refresh(deck)
    return PhaseResponse(deck_id=deck.id, phase="building")


@router.post("/return-to-coaching", response_model=PhaseResponse)
def return_to_coaching(
    deck_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> PhaseResponse:
    deck = get_owned_deck(db, user, deck_id)
    deck.assistant_phase = "coaching"
    db.commit()
    db.refresh(deck)
    return PhaseResponse(deck_id=deck.id, phase="coaching")
