from __future__ import annotations

from app.models import Card, Deck, DeckCard


def validate_deck(deck: Deck, cards_by_id: dict[str, Card]) -> tuple[bool, list[str], int]:
    """Return (valid, violations, total_count)."""
    violations: list[str] = []
    total = 0

    for entry in deck.cards:
        total += entry.count
        card = cards_by_id.get(entry.card_id)
        if card is None:
            violations.append(f"卡牌不存在: {entry.card_id}")
            continue

        if entry.count < 1:
            violations.append(f"「{card.name}」张数无效")
            continue

        max_copies = 1 if card.rarity_slug == "legendary" else 2
        if entry.count > max_copies:
            if card.rarity_slug == "legendary":
                violations.append(f"传说卡「{card.name}」最多 1 张")
            else:
                violations.append(f"「{card.name}」最多 {max_copies} 张")

        allowed_classes = {deck.class_slug, "neutral"}
        if card.class_slug not in allowed_classes:
            violations.append(f"「{card.name}」不属于职业 {deck.class_slug} 或中立")

        if deck.format == "standard" and not card.is_standard:
            violations.append(f"「{card.name}」在标准模式不合法")
        if deck.format == "wild" and not card.is_wild:
            violations.append(f"「{card.name}」在狂野模式不合法")

    if total != 30:
        violations.append(f"卡组必须恰好 30 张，当前 {total} 张")

    return len(violations) == 0, violations, total


def deck_card_count(cards: list[DeckCard]) -> int:
    return sum(c.count for c in cards)
