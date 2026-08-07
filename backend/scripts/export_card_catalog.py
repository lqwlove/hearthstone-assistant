#!/usr/bin/env python3
"""Host adapter: dump collectible catalog to card_wiki/raw/_catalog/cards.jsonl (no LLM)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import select  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models import Card  # noqa: E402

OUT = ROOT / "card_wiki" / "raw" / "_catalog" / "cards.jsonl"


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    db = SessionLocal()
    try:
        cards = db.scalars(select(Card).where(Card.collectible.is_(True)).order_by(Card.id)).all()
        with OUT.open("w", encoding="utf-8") as f:
            for c in cards:
                row = {
                    "id": c.id,
                    "card_id": c.id,
                    "name": c.name,
                    "cost": c.cost,
                    "class_slug": c.class_slug,
                    "card_type": c.card_type,
                    "rarity_slug": c.rarity_slug,
                    "text": c.text,
                    "is_standard": c.is_standard,
                    "is_wild": c.is_wild,
                }
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
    finally:
        db.close()
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
