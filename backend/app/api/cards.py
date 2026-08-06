from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.models import Card, User
from app.schemas import CardListResponse, CardOut, SyncResponse
from app.security import get_current_user
from app.services.blizzard import BlizzardSyncError, sync_cards_to_db

router = APIRouter(prefix="/cards", tags=["cards"])


@router.post("/sync", response_model=SyncResponse)
async def sync_cards(
    x_sync_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    _: User = Depends(get_current_user),
) -> SyncResponse:
    if not x_sync_token or x_sync_token != settings.sync_api_token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="同步令牌无效")
    try:
        count = await sync_cards_to_db(db, settings)
        return SyncResponse(ok=True, synced=count, message=f"已同步 {count} 张卡牌")
    except BlizzardSyncError as exc:
        db.rollback()
        return SyncResponse(ok=False, synced=0, message=str(exc))
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        return SyncResponse(ok=False, synced=0, message=f"同步失败: {exc}")


@router.get("", response_model=CardListResponse)
def list_cards(
    q: str | None = None,
    cost: int | None = None,
    cost_min: int | None = None,
    class_slug: str | None = None,
    include_neutral: bool = Query(default=False),
    rarity_slug: str | None = None,
    card_type: str | None = None,
    format: str | None = Query(default=None, pattern="^(standard|wild)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=40, ge=1, le=100),
    db: Session = Depends(get_db),
) -> CardListResponse:
    filters = [Card.collectible.is_(True)]
    if q:
        filters.append(Card.name.contains(q))
    if cost is not None:
        filters.append(Card.cost == cost)
    if cost_min is not None:
        filters.append(Card.cost >= cost_min)
    if class_slug:
        if include_neutral:
            filters.append(Card.class_slug.in_([class_slug, "neutral"]))
        else:
            filters.append(Card.class_slug == class_slug)
    if rarity_slug:
        filters.append(Card.rarity_slug == rarity_slug)
    if card_type:
        filters.append(Card.card_type == card_type)
    if format == "standard":
        filters.append(Card.is_standard.is_(True))
    elif format == "wild":
        filters.append(Card.is_wild.is_(True))

    where_clause = and_(*filters)
    stmt = select(Card).where(where_clause).order_by(Card.cost.asc(), Card.name.asc())
    total = db.scalar(select(func.count()).select_from(Card).where(where_clause)) or 0
    items = db.scalars(stmt.offset((page - 1) * page_size).limit(page_size)).all()
    return CardListResponse(
        items=[CardOut.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{card_id}", response_model=CardOut)
def get_card(card_id: str, db: Session = Depends(get_db)) -> Card:
    card = db.scalar(select(Card).where(Card.id == card_id))
    if card is None:
        raise HTTPException(status_code=404, detail="卡牌不存在")
    return card
