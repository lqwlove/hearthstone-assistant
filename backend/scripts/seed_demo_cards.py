"""Seed a local card set for development / E2E without Blizzard credentials.

Demo IDs use the `demo-` prefix so they never collide with official Blizzard card IDs.
If the DB already has official cards (numeric IDs with images), this script refuses to
overwrite them — use the library sync instead.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import func, select

from app.database import Base, SessionLocal, engine
from app.models import Card

BASE_CARDS = [
    {
        "id": "demo-1001",
        "name": "火球术（演示）",
        "cost": 4,
        "class_slug": "mage",
        "rarity_slug": "common",
        "card_type": "spell",
        "set_slug": "demo",
        "text": "造成 6 点伤害。",
        "collectible": True,
        "is_standard": True,
        "is_wild": True,
        "image_url": "",
        "raw_json": "{}",
    },
    {
        "id": "demo-1002",
        "name": "水元素（演示）",
        "cost": 4,
        "class_slug": "mage",
        "rarity_slug": "common",
        "card_type": "minion",
        "set_slug": "demo",
        "text": "冻结任何受到该随从伤害的角色。",
        "collectible": True,
        "is_standard": True,
        "is_wild": True,
        "image_url": "",
        "raw_json": "{}",
    },
    {
        "id": "demo-1003",
        "name": "大法师安东尼达斯（演示）",
        "cost": 7,
        "class_slug": "mage",
        "rarity_slug": "legendary",
        "card_type": "minion",
        "set_slug": "demo",
        "text": "每当你施放一个法术，将一张‘火球术’置入你的手牌。",
        "collectible": True,
        "is_standard": False,
        "is_wild": True,
        "image_url": "",
        "raw_json": "{}",
    },
    {
        "id": "demo-1004",
        "name": "银色侍从（演示）",
        "cost": 1,
        "class_slug": "neutral",
        "rarity_slug": "common",
        "card_type": "minion",
        "set_slug": "demo",
        "text": "圣盾",
        "collectible": True,
        "is_standard": True,
        "is_wild": True,
        "image_url": "",
        "raw_json": "{}",
    },
    {
        "id": "demo-1005",
        "name": "疯狂的炼金师（演示）",
        "cost": 2,
        "class_slug": "neutral",
        "rarity_slug": "rare",
        "card_type": "minion",
        "set_slug": "demo",
        "text": "战吼：使一个随从的攻击力和生命值互换。",
        "collectible": True,
        "is_standard": False,
        "is_wild": True,
        "image_url": "",
        "raw_json": "{}",
    },
    {
        "id": "demo-1006",
        "name": "斩杀（演示）",
        "cost": 1,
        "class_slug": "warrior",
        "rarity_slug": "common",
        "card_type": "spell",
        "set_slug": "demo",
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
    for i in range(1, 21):
        cards.append(
            {
                "id": f"demo-mage-{i}",
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
                "id": f"demo-neutral-{i}",
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
        official_count = db.scalar(
            select(func.count()).select_from(Card).where(
                Card.image_url.is_not(None),
                Card.image_url != "",
                ~Card.id.startswith("demo-"),
            )
        ) or 0
        if official_count > 0:
            print(
                f"检测到已有 {official_count} 张官方卡牌，跳过演示种子。"
                "请在牌库页使用「同步官方数据」。"
            )
            return

        for row in demo_cards:
            card = db.get(Card, row["id"])
            if card is None:
                card = Card(id=row["id"])
                db.add(card)
            for k, v in row.items():
                if k != "id":
                    setattr(card, k, v)
        db.commit()
        print(f"seeded {len(demo_cards)} demo cards (ids prefixed with demo-)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
