from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str

    model_config = {"from_attributes": True}


class CardOut(BaseModel):
    id: str
    name: str
    cost: int | None
    class_slug: str
    rarity_slug: str
    card_type: str
    set_slug: str
    text: str
    collectible: bool
    is_standard: bool
    is_wild: bool
    image_url: str

    model_config = {"from_attributes": True}


class CardListResponse(BaseModel):
    items: list[CardOut]
    total: int
    page: int
    page_size: int


class DeckCardIn(BaseModel):
    card_id: str
    count: int = Field(ge=0, le=2)


class DeckCardOut(BaseModel):
    card_id: str
    count: int
    card: CardOut | None = None

    model_config = {"from_attributes": True}


class DeckCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    class_slug: str
    format: Literal["standard", "wild"]


class DeckUpdateDraft(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    cards: list[DeckCardIn]


class DeckOut(BaseModel):
    id: int
    name: str
    class_slug: str
    format: str
    status: str
    card_count: int
    cards: list[DeckCardOut] = []
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class ValidationResult(BaseModel):
    valid: bool
    violations: list[str]
    card_count: int


class FinalizeResponse(BaseModel):
    deck: DeckOut
    validation: ValidationResult


class SyncResponse(BaseModel):
    ok: bool
    synced: int = 0
    message: str


class ChatMessageOut(BaseModel):
    id: int
    role: str
    content: str
    patch_applied: bool = False
    patch_error: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class ChatHistoryResponse(BaseModel):
    thread_id: int
    messages: list[ChatMessageOut]


class ChatSendRequest(BaseModel):
    content: str = Field(min_length=1, max_length=8000)


class ChatSendResponse(BaseModel):
    messages: list[ChatMessageOut]
    deck: DeckOut | None = None
    patch_applied: bool = False
    patch_error: str | None = None
