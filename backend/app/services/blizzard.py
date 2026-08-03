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


# Older set ids no longer returned by /metadata/sets (e.g. classic → legacy era).
_FALLBACK_SET_NAMES: dict[int, str] = {
    2: "基础",
    3: "经典",
    4: "奖励",
    17: "英雄皮肤",
}

# Metadata often returns English even with zh_CN; normalize common reprint sets.
_SET_NAME_ZH: dict[str, str] = {
    "core": "核心",
    "legacy": "怀旧",
    "classic": "经典",
    "expert1": "经典",
    "basic": "基础",
}


def _set_display_name(set_id: int | None, set_meta: dict[str, Any] | None, item: dict[str, Any]) -> str:
    if set_meta:
        slug = str(set_meta.get("slug") or "").lower()
        name = str(set_meta.get("name") or "")
        if slug in _SET_NAME_ZH:
            return _SET_NAME_ZH[slug]
        if name.lower() in _SET_NAME_ZH:
            return _SET_NAME_ZH[name.lower()]
        return name or slug or (str(set_id) if set_id is not None else "")
    if set_id is not None and set_id in _FALLBACK_SET_NAMES:
        return _FALLBACK_SET_NAMES[set_id]
    return _name(item.get("cardSet"), default="") or _slug(item.get("cardSet"), default=str(item.get("cardSetId") or ""))


def map_card_payload(
    item: dict[str, Any],
    sets_by_id: dict[int, dict[str, Any]],
) -> dict[str, Any]:
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
    set_meta = sets_by_id.get(set_id) if set_id is not None else None
    set_slug = _set_display_name(set_id, set_meta, item)

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

    is_standard = bool(set_meta.get("is_standard")) if set_meta else False
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


async def fetch_sets_by_id(
    settings: Settings, client: httpx.AsyncClient, token: str
) -> dict[int, dict[str, Any]]:
    url = f"{_api_host(settings.blizzard_region)}/hearthstone/metadata/sets"
    resp = await client.get(
        url,
        params={"locale": settings.blizzard_locale},
        headers={"Authorization": f"Bearer {token}"},
        timeout=60.0,
    )
    if resp.status_code >= 400:
        return {}
    data = resp.json()
    items = data if isinstance(data, list) else data.get("sets", [])
    sets_by_id: dict[int, dict[str, Any]] = {}
    for s in items:
        if not isinstance(s, dict) or s.get("id") is None:
            continue
        sid = int(s["id"])
        slug = str(s.get("slug") or "")
        is_standard = bool(
            s.get("isStandard") or s.get("standard") or (s.get("type") == "standard") or ("standard" in slug.lower())
        )
        sets_by_id[sid] = {
            "name": str(s.get("name") or slug or sid),
            "slug": slug,
            "is_standard": is_standard,
        }
    return sets_by_id


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
        sets_by_id = await fetch_sets_by_id(settings, client, token)
        raw_cards = await fetch_all_collectible_cards(settings, client, token)

    mapped = [map_card_payload(item, sets_by_id) for item in raw_cards if item.get("id") is not None]
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
