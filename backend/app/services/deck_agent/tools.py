from __future__ import annotations

from typing import Any

from langchain_core.tools import tool
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Card, Deck
from app.services.deck_patch import apply_deck_patch as apply_deck_patch_ops
from app.services.validation import validate_deck


def build_deck_tools(db: Session, deck: Deck) -> list[Any]:
    deck_id = deck.id

    @tool
    def get_current_deck() -> str:
        """读取当前卡组草稿（名称、职业、模式、卡牌列表）。"""
        fresh = db.scalar(select(Deck).where(Deck.id == deck_id))
        if fresh is None:
            return "卡组不存在"
        total = sum(dc.count for dc in fresh.cards)
        lines = [
            f"name={fresh.name}",
            f"class={fresh.class_slug}",
            f"format={fresh.format}",
            f"status={fresh.status}",
            f"card_count={total}/30",
            "cards:",
        ]
        for dc in fresh.cards:
            name = dc.card.name if dc.card else dc.card_id
            lines.append(f"- {dc.card_id} {name} x{dc.count}")
        return "\n".join(lines)

    @tool
    def validate_current_deck() -> str:
        """对当前卡组草稿执行构筑规则校验，返回是否通过及违规项。中间态可不满 30 张。"""
        fresh = db.scalar(select(Deck).where(Deck.id == deck_id))
        if fresh is None:
            return "卡组不存在"
        needed = {dc.card_id for dc in fresh.cards}
        cards = {
            c.id: c for c in db.scalars(select(Card).where(Card.id.in_(needed))).all()
        } if needed else {}
        valid, violations, total = validate_deck(fresh, cards)
        if valid:
            return f"valid=true card_count={total}"
        return "valid=false\n" + "\n".join(violations)

    @tool
    def apply_deck_patch(ops: list[dict[str, Any]]) -> str:
        """改套：随时可用。用 set_count 加卡/改数量/删卡（count=0 删除）。
        一次可改任意张数；中间态可不满 30。ops 示例:
        [{"op":"set_count","card_id":"126662","count":2}]
        card_id 须来自已读 archetype skill 或用户明确给出的 ID。流程见 deck-edit skill。
        """
        fresh = db.scalar(select(Deck).where(Deck.id == deck_id))
        if fresh is None:
            return "错误: 卡组不存在"
        ok, err = apply_deck_patch_ops(db, fresh, {"ops": ops})
        if not ok:
            return f"错误: {err or '改套失败'}"
        if fresh.assistant_phase != "building":
            fresh.assistant_phase = "building"
            db.commit()
        total = sum(dc.count for dc in fresh.cards)
        return f"改套已应用 card_count={total}/30"

    return [get_current_deck, validate_current_deck, apply_deck_patch]
