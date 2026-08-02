from __future__ import annotations

import json
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Card


class BlizzardSyncError(Exception):
    pass


def _api_host(region: str) -> str:
    return f"https://{region}.api.blizzard.com"


async def fetch_access_token(settings: Settings, client: httpx.AsyncClient) -> str:
    if not settings.blizzard_client_id or not settings.blizzard_client_secret:
        raise BlizzardSyncError("未配置 BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET")
    url = "https://oauth.battle.net/token"
    resp = await client.post(
        url,
        data={"grant_type": "client_credentials"},
        auth=(settings.blizzard_client_id, settings.blizzard_client_secret),
        timeout=30.0,
    )
    if resp.status_code >= 400:
        raise BlizzardSyncError(f"获取暴雪令牌失败: HTTP {resp.status_code}")
    data = resp.json()
    token = data.get("access_token")
    if not token:
        raise BlizzardSyncError("暴雪令牌响应缺少 access_token")
    return token


def _slug(value: Any, default: str = "") -> str:
    if value is None:
        return default
    if isinstance(value, dict):
        return str(value.get("slug") or value.get("id") or default)
    return str(value)


def _name(value: Any, default: str = "") -> str:
    if isinstance(value, dict):
        return str(value.get("name") or default)
    return str(value or default)


def map_card_payload(item: dict[str, Any], standard_set_ids: set[int]) -> dict[str, Any]:
    card_set = item.get("cardSetId")
    set_id = int(card_set) if card_set is not None else None
    class_info = item.get("classId")
    # Blizzard returns classId as int; multiClassId as list. Map common ids via metadata later if needed.
    rarity = item.get("rarityId")
    card_type = item.get("cardTypeId")

    # Prefer expanded fields when present
    class_slug = _slug(item.get("class"), default=str(class_info or "neutral"))
    rarity_slug = _slug(item.get("rarity"), default=str(rarity or "common"))
    type_slug = _slug(item.get("cardType"), default=str(card_type or "minion"))
    set_slug = _slug(item.get("cardSet"), default=str(card_set or ""))

    # Heuristic name mapping when only numeric ids present
    class_map = {
        1: "deathknight",
        2: "druid",
        3: "hunter",
        4: "mage",
        5: "paladin",
        6: "priest",
        7: "rogue",
        8: "shaman",
        9: "warlock",
        10: "warrior",
        12: "neutral",
        14: "demonhunter",
    }
    rarity_map = {1: "common", 2: "free", 3: "rare", 4: "epic", 5: "legendary"}
    type_map = {3: "hero", 4: "minion", 5: "spell", 7: "weapon", 39: "location"}

    if class_slug.isdigit():
        class_slug = class_map.get(int(class_slug), "neutral")
    if rarity_slug.isdigit():
        rarity_slug = rarity_map.get(int(rarity_slug), "common")
    if type_slug.isdigit():
        type_slug = type_map.get(int(type_slug), "minion")

    is_standard = bool(set_id is not None and set_id in standard_set_ids)
    # Collectible constructed cards are wild-legal if collectible
    collectible = bool(item.get("collectible"))
    is_wild = collectible

    image = ""
    if isinstance(item.get("image"), str):
        image = item["image"]
    elif isinstance(item.get("cropImage"), str):
        image = item["cropImage"]

    return {
        "id": str(item.get("id")),
        "name": str(item.get("name") or f"Card-{item.get('id')}"),
        "cost": item.get("manaCost"),
        "class_slug": class_slug,
        "rarity_slug": rarity_slug,
        "card_type": type_slug,
        "set_slug": set_slug,
        "text": str(item.get("text") or ""),
        "collectible": collectible,
        "is_standard": is_standard,
        "is_wild": is_wild,
        "image_url": image,
        "raw_json": json.dumps(item, ensure_ascii=False),
    }


async def fetch_standard_set_ids(settings: Settings, client: httpx.AsyncClient, token: str) -> set[int]:
    url = f"{_api_host(settings.blizzard_region)}/hearthstone/metadata/sets"
    resp = await client.get(
        url,
        params={"locale": settings.blizzard_locale},
        headers={"Authorization": f"Bearer {token}"},
        timeout=60.0,
    )
    if resp.status_code >= 400:
        # Fallback: empty set means only wild flags; sync still useful
        return set()
    data = resp.json()
    standard_ids: set[int] = set()
    items = data if isinstance(data, list) else data.get("sets", [])
    for s in items:
        if not isinstance(s, dict):
            continue
        # Blizzard marks sets with alias or type; prefer explicit standard flag when present
        if s.get("isStandard") or s.get("standard") or (s.get("type") == "standard"):
            sid = s.get("id")
            if sid is not None:
                standard_ids.add(int(sid))
        # Also include sets listed under standard year aliases when provided
        if "standard" in str(s.get("slug", "")).lower() and s.get("id") is not None:
            standard_ids.add(int(s["id"]))
    return standard_ids


async def fetch_all_collectible_cards(
    settings: Settings, client: httpx.AsyncClient, token: str
) -> list[dict[str, Any]]:
    page = 1
    page_count = 1
    cards: list[dict[str, Any]] = []
    while page <= page_count:
        url = f"{_api_host(settings.blizzard_region)}/hearthstone/cards"
        resp = await client.get(
            url,
            params={
                "locale": settings.blizzard_locale,
                "collectible": 1,
                "page": page,
                "pageSize": 100,
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=60.0,
        )
        if resp.status_code >= 400:
            raise BlizzardSyncError(f"拉取卡牌失败: HTTP {resp.status_code} {resp.text[:200]}")
        payload = resp.json()
        page_count = int(payload.get("pageCount") or 1)
        batch = payload.get("cards") or []
        cards.extend(batch)
        page += 1
    return cards


async def sync_cards_to_db(db: Session, settings: Settings) -> int:
    """Fetch from Blizzard and upsert into local DB. On failure raises without partial commit preference:
    caller should rollback. We stage updates in-memory then commit once.
    """
    async with httpx.AsyncClient() as client:
        token = await fetch_access_token(settings, client)
        standard_ids = await fetch_standard_set_ids(settings, client, token)
        raw_cards = await fetch_all_collectible_cards(settings, client, token)

    mapped = [map_card_payload(item, standard_ids) for item in raw_cards if item.get("id") is not None]
    if not mapped:
        raise BlizzardSyncError("官方 API 未返回可收藏卡牌")

    existing = {c.id: c for c in db.scalars(select(Card)).all()}
    for row in mapped:
        card = existing.get(row["id"])
        if card is None:
            card = Card(id=row["id"])
            db.add(card)
        for key, value in row.items():
            if key == "id":
                continue
            setattr(card, key, value)
    db.commit()
    return len(mapped)
