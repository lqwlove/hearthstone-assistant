from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.models import SkillPack, User
from app.schemas import SkillPackOut, SkillPackReview, SkillPackSubmit
from app.security import get_current_user
from app.services.deck_agent.skills import materialize_approved_skills, validate_skill_md

router = APIRouter(prefix="/skills", tags=["skills"])


@router.post("/market", response_model=SkillPackOut, status_code=201)
def submit_skill_pack(
    body: SkillPackSubmit,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SkillPackOut:
    ok, err = validate_skill_md(body.skill_md)
    if not ok:
        raise HTTPException(status_code=400, detail=err)

    existing = db.scalar(
        select(SkillPack).where(SkillPack.slug == body.slug, SkillPack.version == body.version)
    )
    if existing is not None:
        raise HTTPException(status_code=400, detail="同 slug+version 已存在")

    pack = SkillPack(
        slug=body.slug,
        name=body.name,
        description=body.description,
        version=body.version,
        status="pending",
        author_user_id=user.id,
        skill_md=body.skill_md,
    )
    db.add(pack)
    db.commit()
    db.refresh(pack)
    return SkillPackOut.model_validate(pack)


@router.get("/market/mine", response_model=list[SkillPackOut])
def list_my_skill_packs(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[SkillPackOut]:
    rows = db.scalars(
        select(SkillPack).where(SkillPack.author_user_id == user.id).order_by(SkillPack.id.desc())
    ).all()
    return [SkillPackOut.model_validate(r) for r in rows]


@router.get("/market", response_model=list[SkillPackOut])
def list_public_skill_packs(db: Session = Depends(get_db)) -> list[SkillPackOut]:
    rows = db.scalars(
        select(SkillPack).where(SkillPack.status == "approved").order_by(SkillPack.id.desc())
    ).all()
    return [SkillPackOut.model_validate(r) for r in rows]


def _require_admin(settings: Settings, x_admin_token: str | None) -> None:
    expected = settings.effective_skill_admin_token
    if not expected or x_admin_token != expected:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员令牌")


@router.post("/market/{pack_id}/review", response_model=SkillPackOut)
def review_skill_pack(
    pack_id: int,
    body: SkillPackReview,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
) -> SkillPackOut:
    _require_admin(settings, x_admin_token)
    pack = db.scalar(select(SkillPack).where(SkillPack.id == pack_id))
    if pack is None:
        raise HTTPException(status_code=404, detail="技能包不存在")
    pack.status = body.status
    pack.review_note = body.review_note
    pack.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(pack)
    materialize_approved_skills(db)
    return SkillPackOut.model_validate(pack)
