from __future__ import annotations

from typing import Any

from langchain_core.tools import tool
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models import Card, Deck
from app.services.deck_patch import apply_deck_patch as apply_deck_patch_ops
from app.services.validation import validate_deck


def build_deck_tools(db: Session, deck: Deck) -> list[Any]:
    deck_id = deck.id

    @tool
    def search_cards(query: str, limit: int = 8) -> str:
        """在本地卡牌库中按名称/文本检索可收藏卡牌。返回简要列表。"""
        q = (query or "").strip()
        lim = max(1, min(limit, 20))
        stmt = select(Card).where(Card.collectible.is_(True))
        if q:
            like = f"%{q}%"
            stmt = stmt.where(or_(Card.name.ilike(like), Card.text.ilike(like)))
        stmt = stmt.order_by(Card.cost.asc().nulls_last(), Card.name.asc()).limit(lim)
        rows = db.scalars(stmt).all()
        if not rows:
            return "未找到匹配卡牌"
        lines = [
            f"{c.id} | {c.cost if c.cost is not None else '-'}费 | {c.name} | {c.class_slug} | {c.rarity_slug}"
            for c in rows
        ]
        return "\n".join(lines)

    @tool
    def get_current_deck() -> str:
        """读取当前卡组草稿（名称、职业、模式、阶段、卡牌列表）。"""
        fresh = db.scalar(select(Deck).where(Deck.id == deck_id))
        if fresh is None:
            return "卡组不存在"
        lines = [
            f"name={fresh.name}",
            f"class={fresh.class_slug}",
            f"format={fresh.format}",
            f"status={fresh.status}",
            f"phase={fresh.assistant_phase}",
            "cards:",
        ]
        for dc in fresh.cards:
            name = dc.card.name if dc.card else dc.card_id
            lines.append(f"- {dc.card_id} {name} x{dc.count}")
        return "\n".join(lines)

    @tool
    def validate_current_deck() -> str:
        """对当前卡组草稿执行构筑规则校验，返回是否通过及违规项。"""
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
        """仅在 building 阶段可用。用 set_count 操作更新草稿卡牌数量。ops 示例:
        [{"op":"set_count","card_id":"123","count":1}]
        """
        fresh = db.scalar(select(Deck).where(Deck.id == deck_id))
        if fresh is None:
            return "错误: 卡组不存在"
        if fresh.assistant_phase != "building":
            return "错误: 当前为 coaching 阶段，禁止改套。请用户点击「开始组牌」后再试。"
        ok, err = apply_deck_patch_ops(db, fresh, {"ops": ops})
        if not ok:
            return f"错误: {err or '改套失败'}"
        return "改套已应用"

    return [search_cards, get_current_deck, validate_current_deck, apply_deck_patch]
