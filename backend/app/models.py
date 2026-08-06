from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    decks: Mapped[list[Deck]] = relationship(back_populates="owner")


class Card(Base):
    __tablename__ = "cards"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # blizzard card id
    name: Mapped[str] = mapped_column(String(255), index=True)
    cost: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    class_slug: Mapped[str] = mapped_column(String(64), index=True, default="neutral")
    rarity_slug: Mapped[str] = mapped_column(String(64), index=True, default="common")
    card_type: Mapped[str] = mapped_column(String(64), default="minion")
    set_slug: Mapped[str] = mapped_column(String(128), default="")
    text: Mapped[str] = mapped_column(Text, default="")
    collectible: Mapped[bool] = mapped_column(Boolean, default=True)
    is_standard: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_wild: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    image_url: Mapped[str] = mapped_column(String(512), default="")
    raw_json: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Deck(Base):
    __tablename__ = "decks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    class_slug: Mapped[str] = mapped_column(String(64))
    format: Mapped[str] = mapped_column(String(32))  # standard | wild
    status: Mapped[str] = mapped_column(String(32), default="draft")  # draft | completed
    assistant_phase: Mapped[str] = mapped_column(
        String(32), default="coaching"
    )  # coaching | building
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    owner: Mapped[User] = relationship(back_populates="decks")
    cards: Mapped[list[DeckCard]] = relationship(
        back_populates="deck", cascade="all, delete-orphan", lazy="selectin"
    )
    chat_thread: Mapped[ChatThread | None] = relationship(
        back_populates="deck", cascade="all, delete-orphan", uselist=False
    )


class DeckCard(Base):
    __tablename__ = "deck_cards"
    __table_args__ = (UniqueConstraint("deck_id", "card_id", name="uq_deck_card"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    deck_id: Mapped[int] = mapped_column(ForeignKey("decks.id", ondelete="CASCADE"), index=True)
    card_id: Mapped[str] = mapped_column(ForeignKey("cards.id"), index=True)
    count: Mapped[int] = mapped_column(Integer, default=1)

    deck: Mapped[Deck] = relationship(back_populates="cards")
    card: Mapped[Card] = relationship(lazy="joined")


class ChatThread(Base):
    __tablename__ = "chat_threads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    deck_id: Mapped[int] = mapped_column(
        ForeignKey("decks.id", ondelete="CASCADE"), unique=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    deck: Mapped[Deck] = relationship(back_populates="chat_thread")
    messages: Mapped[list[ChatMessage]] = relationship(
        back_populates="thread", cascade="all, delete-orphan", order_by="ChatMessage.id"
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    thread_id: Mapped[int] = mapped_column(ForeignKey("chat_threads.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(32))  # user | assistant | system
    content: Mapped[str] = mapped_column(Text)
    patch_applied: Mapped[bool] = mapped_column(Boolean, default=False)
    patch_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    thread: Mapped[ChatThread] = relationship(back_populates="messages")


class SkillPack(Base):
    __tablename__ = "skill_packs"
    __table_args__ = (UniqueConstraint("slug", "version", name="uq_skill_pack_slug_version"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slug: Mapped[str] = mapped_column(String(128), index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    version: Mapped[str] = mapped_column(String(64), default="1.0.0")
    status: Mapped[str] = mapped_column(
        String(32), default="pending", index=True
    )  # pending | approved | rejected | unpublished
    author_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    skill_md: Mapped[str] = mapped_column(Text)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
