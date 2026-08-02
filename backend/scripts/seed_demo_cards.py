"""Seed a local card set for development / E2E without Blizzard credentials."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.database import Base, SessionLocal, engine
from app.models import Card

BASE_CARDS = [
    {
        "id": "1001",
        "name": "火球术",
        "cost": 4,
        "class_slug": "mage",
        "rarity_slug": "common",
        "card_type": "spell",
        "set_slug": "legacy",
        "text": "造成 6 点伤害。",
        "collectible": True,
        "is_standard": True,
        "is_wild": True,
        "image_url": "",
        "raw_json": "{}",
    },
    {
        "id": "1002",
        "name": "水元素",
        "cost": 4,
        "class_slug": "mage",
        "rarity_slug": "common",
        "card_type": "minion",
        "set_slug": "legacy",
        "text": "冻结任何受到该随从伤害的角色。",
        "collectible": True,
        "is_standard": True,
        "is_wild": True,
        "image_url": "",
        "raw_json": "{}",
    },
    {
        "id": "1003",
        "name": "大法师安东尼达斯",
        "cost": 7,
        "class_slug": "mage",
        "rarity_slug": "legendary",
        "card_type": "minion",
        "set_slug": "legacy",
        "text": "每当你施放一个法术，将一张‘火球术’置入你的手牌。",
        "collectible": True,
        "is_standard": False,
        "is_wild": True,
        "image_url": "",
        "raw_json": "{}",
    },
    {
        "id": "1004",
        "name": "银色侍从",
        "cost": 1,
        "class_slug": "neutral",
        "rarity_slug": "common",
        "card_type": "minion",
        "set_slug": "legacy",
        "text": "圣盾",
        "collectible": True,
        "is_standard": True,
        "is_wild": True,
        "image_url": "",
        "raw_json": "{}",
    },
    {
        "id": "1005",
        "name": "疯狂的炼金师",
        "cost": 2,
        "class_slug": "neutral",
        "rarity_slug": "rare",
        "card_type": "minion",
        "set_slug": "legacy",
        "text": "战吼：使一个随从的攻击力和生命值互换。",
        "collectible": True,
        "is_standard": False,
        "is_wild": True,
        "image_url": "",
        "raw_json": "{}",
    },
    {
        "id": "1006",
        "name": "斩杀",
        "cost": 1,
        "class_slug": "warrior",
        "rarity_slug": "common",
        "card_type": "spell",
        "set_slug": "legacy",
        "text": "消灭一个受伤的敌方随从。",
        "collectible": True,
        "is_standard": True,
        "is_wild": True,
        "image_url": "",
        "raw_json": "{}",
    },
]


def build_demo_cards() -> list[dict]:
    cards = list(BASE_CARDS)
    # Enough standard mage/neutral commons to assemble a legal 30-card deck.
    for i in range(1, 21):
        cards.append(
            {
                "id": str(1100 + i),
                "name": f"法师练习卡{i}",
                "cost": i % 8,
                "class_slug": "mage",
                "rarity_slug": "common",
                "card_type": "minion",
                "set_slug": "demo",
                "text": "演示用卡牌。",
                "collectible": True,
                "is_standard": True,
                "is_wild": True,
                "image_url": "",
                "raw_json": "{}",
            }
        )
    for i in range(1, 11):
        cards.append(
            {
                "id": str(1200 + i),
                "name": f"中立练习卡{i}",
                "cost": i % 7,
                "class_slug": "neutral",
                "rarity_slug": "common",
                "card_type": "minion",
                "set_slug": "demo",
                "text": "演示用卡牌。",
                "collectible": True,
                "is_standard": True,
                "is_wild": True,
                "image_url": "",
                "raw_json": "{}",
            }
        )
    return cards


def main() -> None:
    Base.metadata.create_all(bind=engine)
    demo_cards = build_demo_cards()
    db = SessionLocal()
    try:
        for row in demo_cards:
            card = db.get(Card, row["id"])
            if card is None:
                card = Card(id=row["id"])
                db.add(card)
            for k, v in row.items():
                if k != "id":
                    setattr(card, k, v)
        db.commit()
        print(f"seeded {len(demo_cards)} demo cards")
    finally:
        db.close()


if __name__ == "__main__":
    main()
