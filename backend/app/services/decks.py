from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Card, Deck, DeckCard, User
from app.schemas import DeckCardIn, DeckOut, DeckCardOut, CardOut
from app.services.validation import deck_card_count


def get_owned_deck(db: Session, user: User, deck_id: int) -> Deck:
    deck = db.scalar(select(Deck).where(Deck.id == deck_id))
    if deck is None or deck.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="卡组不存在")
    return deck


def replace_deck_cards(db: Session, deck: Deck, cards: list[DeckCardIn]) -> None:
    # Validate referenced cards exist
    ids = [c.card_id for c in cards if c.count > 0]
    if ids:
        found = set(db.scalars(select(Card.id).where(Card.id.in_(ids))).all())
        missing = [i for i in ids if i not in found]
        if missing:
            raise HTTPException(status_code=400, detail=f"卡牌不存在: {', '.join(missing)}")

    deck.cards.clear()
    db.flush()
    for item in cards:
        if item.count <= 0:
            continue
        deck.cards.append(DeckCard(card_id=item.card_id, count=item.count))
    deck.status = "draft"


def serialize_deck(deck: Deck) -> DeckOut:
    cards_out: list[DeckCardOut] = []
    for dc in sorted(deck.cards, key=lambda x: (x.card.cost if x.card and x.card.cost is not None else 99, x.card_id)):
        card_out = CardOut.model_validate(dc.card) if dc.card else None
        cards_out.append(DeckCardOut(card_id=dc.card_id, count=dc.count, card=card_out))
    return DeckOut(
        id=deck.id,
        name=deck.name,
        class_slug=deck.class_slug,
        format=deck.format,
        status=deck.status,
        assistant_phase=getattr(deck, "assistant_phase", None) or "coaching",
        card_count=deck_card_count(list(deck.cards)),
        cards=cards_out,
        created_at=deck.created_at,
        updated_at=deck.updated_at,
    )
