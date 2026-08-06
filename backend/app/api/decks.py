from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Card, Deck, User
from app.schemas import (
    DeckCreate,
    DeckOut,
    DeckUpdateDraft,
    FinalizeResponse,
    ValidationResult,
)
from app.security import get_current_user
from app.services.decks import get_owned_deck, replace_deck_cards, serialize_deck
from app.services.validation import validate_deck

router = APIRouter(prefix="/decks", tags=["decks"])


@router.get("", response_model=list[DeckOut])
def list_decks(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[DeckOut]:
    decks = (
        db.scalars(select(Deck).where(Deck.user_id == user.id).order_by(Deck.updated_at.desc()))
        .unique()
        .all()
    )
    return [serialize_deck(d) for d in decks]


@router.post("", response_model=DeckOut, status_code=201)
def create_deck(
    body: DeckCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> DeckOut:
    deck = Deck(
        user_id=user.id,
        name=body.name,
        class_slug=body.class_slug,
        format=body.format,
        status="draft",
        assistant_phase="coaching",
    )
    db.add(deck)
    db.commit()
    db.refresh(deck)
    return serialize_deck(deck)


@router.get("/{deck_id}", response_model=DeckOut)
def get_deck(deck_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> DeckOut:
    return serialize_deck(get_owned_deck(db, user, deck_id))


@router.delete("/{deck_id}", status_code=204)
def delete_deck(
    deck_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> None:
    deck = get_owned_deck(db, user, deck_id)
    db.delete(deck)
    db.commit()


@router.put("/{deck_id}/draft", response_model=DeckOut)
def save_draft(
    deck_id: int,
    body: DeckUpdateDraft,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> DeckOut:
    deck = get_owned_deck(db, user, deck_id)
    if body.name is not None:
        deck.name = body.name
    replace_deck_cards(db, deck, body.cards)
    db.commit()
    db.refresh(deck)
    return serialize_deck(deck)


@router.post("/{deck_id}/validate", response_model=ValidationResult)
def preview_validate(
    deck_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> ValidationResult:
    deck = get_owned_deck(db, user, deck_id)
    cards = {c.id: c for c in db.scalars(select(Card)).all()}
    # limit to referenced
    needed = {dc.card_id for dc in deck.cards}
    cards = {cid: cards[cid] for cid in needed if cid in cards}
    # also load missing individually
    for cid in needed - set(cards):
        card = db.scalar(select(Card).where(Card.id == cid))
        if card:
            cards[cid] = card
    valid, violations, total = validate_deck(deck, cards)
    return ValidationResult(valid=valid, violations=violations, card_count=total)


@router.post("/{deck_id}/finalize", response_model=FinalizeResponse)
def finalize_deck(
    deck_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> FinalizeResponse:
    deck = get_owned_deck(db, user, deck_id)
    needed = {dc.card_id for dc in deck.cards}
    cards = {
        c.id: c for c in db.scalars(select(Card).where(Card.id.in_(needed))).all()
    } if needed else {}
    valid, violations, total = validate_deck(deck, cards)
    result = ValidationResult(valid=valid, violations=violations, card_count=total)
    if not valid:
        raise HTTPException(
            status_code=400,
            detail={"message": "卡组未通过校验，无法最终保存", "validation": result.model_dump()},
        )
    deck.status = "completed"
    db.commit()
    db.refresh(deck)
    return FinalizeResponse(deck=serialize_deck(deck), validation=result)
