from __future__ import annotations

import json
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Card, Deck, DeckCard

PATCH_RE = re.compile(r"```json\s*(\{.*?\})\s*```", re.DOTALL | re.IGNORECASE)


def extract_patch(content: str) -> dict[str, Any] | None:
    match = PATCH_RE.search(content)
    if not match:
        # also allow bare JSON object containing "ops"
        stripped = content.strip()
        if stripped.startswith("{") and '"ops"' in stripped:
            try:
                return json.loads(stripped)
            except json.JSONDecodeError:
                return None
        return None
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return None


def apply_deck_patch(db: Session, deck: Deck, patch: dict[str, Any]) -> tuple[bool, str | None]:
    """Apply patch to deck draft. Returns (applied, error_message)."""
    ops = patch.get("ops")
    if not isinstance(ops, list):
        return False, "改套指令缺少 ops 列表"

    # Work on a copy of counts
    counts: dict[str, int] = {c.card_id: c.count for c in deck.cards}

    for op in ops:
        if not isinstance(op, dict):
            return False, "改套指令包含非法操作"
        if op.get("op") != "set_count":
            return False, f"不支持的操作: {op.get('op')}"
        card_id = str(op.get("card_id", ""))
        count = op.get("count")
        if not card_id:
            return False, "改套指令缺少 card_id"
        if not isinstance(count, int) or count < 0 or count > 2:
            return False, f"卡牌 {card_id} 的 count 非法"
        card = db.scalar(select(Card).where(Card.id == card_id))
        if card is None:
            return False, f"卡牌不存在: {card_id}"
        if count == 0:
            counts.pop(card_id, None)
        else:
            counts[card_id] = count

    # Replace deck cards
    deck.cards.clear()
    db.flush()
    for card_id, count in counts.items():
        deck.cards.append(DeckCard(card_id=card_id, count=count))
    deck.status = "draft"
    db.commit()
    db.refresh(deck)
    return True, None
