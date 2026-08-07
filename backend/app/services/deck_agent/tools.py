from __future__ import annotations

from typing import Any

from langchain_core.tools import tool
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.models import Card, Deck
from app.services.deck_patch import apply_deck_patch as apply_deck_patch_ops
from app.services.validation import validate_deck

_SEARCH_LIMIT = 12


def build_deck_tools(db: Session, deck: Deck) -> list[Any]:
    deck_id = deck.id
    class_slug = deck.class_slug
    deck_format = deck.format

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
    def search_cards(
        q: str = "",
        cost: int | None = None,
        cost_min: int | None = None,
        cost_max: int | None = None,
        card_type: str = "",
        rarity_slug: str = "",
    ) -> str:
        """按当前卡组职业+中立、模式搜索可收集卡。用于按流派思想补位、填满 30 张。
        q 匹配名称或卡牌文本；cost / cost_min / cost_max 管费用；card_type、rarity_slug 可选。
        最多返回 12 条，结果含 card_id 可直接用于 apply_deck_patch。
        archetype skill 里的卡表只是参考，不是唯一可用牌——按思想搜库补齐。"""
        filters: list[Any] = [
            Card.collectible.is_(True),
            Card.class_slug.in_([class_slug, "neutral"]),
        ]
        if deck_format == "standard":
            filters.append(Card.is_standard.is_(True))
        elif deck_format == "wild":
            filters.append(Card.is_wild.is_(True))

        query = (q or "").strip()
        if query:
            like = f"%{query}%"
            filters.append(or_(Card.name.ilike(like), Card.text.ilike(like)))
        if cost is not None:
            filters.append(Card.cost == cost)
        if cost_min is not None:
            filters.append(Card.cost >= cost_min)
        if cost_max is not None:
            filters.append(Card.cost <= cost_max)
        if card_type.strip():
            filters.append(Card.card_type == card_type.strip())
        if rarity_slug.strip():
            filters.append(Card.rarity_slug == rarity_slug.strip())

        rows = db.scalars(
            select(Card)
            .where(and_(*filters))
            .order_by(Card.cost.asc().nulls_last(), Card.name.asc())
            .limit(_SEARCH_LIMIT)
        ).all()
        if not rows:
            return "未找到匹配卡牌。放宽关键词或费用再试。"
        lines = [f"found={len(rows)} (max {_SEARCH_LIMIT}) class={class_slug}|neutral format={deck_format}"]
        for c in rows:
            cost_s = "-" if c.cost is None else str(c.cost)
            snippet = (c.text or "").replace("\n", " ")[:80]
            lines.append(
                f"- {c.id} | {c.name} | cost={cost_s} | {c.card_type} | {c.rarity_slug} | {c.class_slug}"
                + (f" | {snippet}" if snippet else "")
            )
        return "\n".join(lines)

    @tool
    def apply_deck_patch(ops: list[dict[str, Any]]) -> str:
        """改套：随时可用。用 set_count 加卡/改数量/删卡（count=0 删除）。
        一次可改任意张数；中间态可不满 30。ops 示例:
        [{"op":"set_count","card_id":"126662","count":2}]
        card_id 可来自 archetype 参考表、search_cards 结果或用户给出的 ID。
        目标是组满合法 30 张；流程见 deck-edit skill。"""
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

    return [get_current_deck, validate_current_deck, search_cards, apply_deck_patch]
