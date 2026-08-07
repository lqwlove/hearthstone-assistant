from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from deepagents import (
    GeneralPurposeSubagentProfile,
    HarnessProfile,
    create_deep_agent,
    register_harness_profile,
)
from deepagents.backends import CompositeBackend, FilesystemBackend, StoreBackend
from deepagents.middleware.filesystem import FilesystemPermission
from langchain_core.messages import HumanMessage
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.models import Card, Deck
from app.schemas import ChatMessageOut, DeckOut
from app.services.deck_agent.memory import get_checkpointer, get_store
from app.services.deck_agent.mock_model import MockCoachModel
from app.services.deck_agent.skills import BACKEND_ROOT, BUILTIN_SKILLS_DIR, MARKET_SKILLS_DIR, skill_source_roots
from app.services.deck_agent.tools import build_deck_tools
from app.services.deck_agent.transcript import append_chat_turn, load_transcript
from app.services.decks import serialize_deck

logger = logging.getLogger(__name__)

_PROFILE_REGISTERED = False

_EXCLUDED = frozenset({"execute", "task"})


def thread_id_for(user_id: int, deck_id: int) -> str:
    return f"user:{user_id}:deck:{deck_id}"


def _ensure_harness_profile() -> None:
    global _PROFILE_REGISTERED
    if _PROFILE_REGISTERED:
        return
    profile = HarnessProfile(
        excluded_tools=_EXCLUDED,
        general_purpose_subagent=GeneralPurposeSubagentProfile(enabled=False),
    )
    # provider keys for pre-built / string models
    for key in ("mockcoachmodel", "openai", "anthropic", "claude"):
        register_harness_profile(key, profile)
    _PROFILE_REGISTERED = True


def _resolve_model(settings: Settings, sample_card_id: str) -> Any:
    provider = (settings.llm_provider or "mock").lower()
    if provider == "mock" or not settings.llm_api_key:
        return MockCoachModel(sample_card_id=sample_card_id)

    model_name = settings.llm_model or "gpt-4o-mini"
    if provider == "openai":
        from langchain_openai import ChatOpenAI

        kwargs: dict[str, Any] = {"model": model_name, "api_key": settings.llm_api_key}
        if settings.llm_base_url:
            kwargs["base_url"] = settings.llm_base_url
        return ChatOpenAI(**kwargs)
    if provider == "claude":
        from langchain_anthropic import ChatAnthropic

        kwargs = {"model": model_name, "api_key": settings.llm_api_key}
        if settings.llm_base_url:
            kwargs["base_url"] = settings.llm_base_url
        return ChatAnthropic(**kwargs)

    return MockCoachModel(sample_card_id=sample_card_id)


def _message_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text", "")))
            elif isinstance(block, str):
                parts.append(block)
        return "".join(parts)
    return str(content)


def _project_messages(raw_messages: list[Any]) -> list[ChatMessageOut]:
    out: list[ChatMessageOut] = []
    idx = 0
    for msg in raw_messages:
        role = getattr(msg, "type", None) or getattr(msg, "role", None)
        if role in ("human", "user"):
            mapped_role = "user"
        elif role in ("ai", "assistant"):
            mapped_role = "assistant"
        else:
            continue
        content = _message_text(getattr(msg, "content", ""))
        if not content and mapped_role == "assistant":
            tool_calls = getattr(msg, "tool_calls", None) or []
            if tool_calls:
                continue
        idx += 1
        out.append(
            ChatMessageOut(
                id=idx,
                role=mapped_role,
                content=content or "",
                patch_applied=False,
                patch_error=None,
                created_at=datetime.now(timezone.utc),
            )
        )
    return out


def _build_backend(user_id: int) -> CompositeBackend:
    store = get_store()

    def user_ns(_rt: Any) -> tuple[str, ...]:
        return ("memories", f"user:{user_id}")

    return CompositeBackend(
        default=FilesystemBackend(root_dir=str(BACKEND_ROOT), virtual_mode=True),
        routes={
            "/memories/": StoreBackend(namespace=user_ns, store=store),
        },
    )


def _create_agent(db: Session, deck: Deck, settings: Settings) -> Any:
    _ensure_harness_profile()
    skill_source_roots(db)
    BUILTIN_SKILLS_DIR.mkdir(parents=True, exist_ok=True)
    MARKET_SKILLS_DIR.mkdir(parents=True, exist_ok=True)

    tools = build_deck_tools(db, deck)
    sample = db.scalar(
        select(Card)
        .where(Card.collectible.is_(True), Card.class_slug.in_([deck.class_slug, "neutral"]))
        .limit(1)
    )
    sample_id = sample.id if sample else "1000"
    model = _resolve_model(settings, sample_id)

    system_prompt = (
        "你是炉石传说专业组牌教练。用简体中文回复。\n"
        f"当前卡组 id={deck.id} name={deck.name} class={deck.class_slug} "
        f"format={deck.format}\n"
        "澄清用 coach-intake；改套用 deck-edit；流派思想用对应 archetype skill（卡表仅参考，非封闭卡池）；"
        "卡牌/流派建议用 wiki-query 读 /card_wiki/wiki/（先 index 再少量 pages）；"
        "曲线用 curve-check。优先级：archetype → wiki → search_cards → validate/patch。"
        "用 search_cards 按思想补位，目标是组满合法 30 张，不要因参考表用尽就停手。\n"
        "通用改套规则只在 deck-edit，不要在各流派 skill 里重复发明流程。\n"
        "长期偏好写入 /memories/AGENTS.md；技能目录：/agent_skills/builtin/ 与 /data/skill_market/。"
        "card wiki 对组牌只读：只用 wiki-query，不要写入 /card_wiki/。"
        "不要使用 wiki-cold-start / wiki-maintain / wiki-lint（维护不在组牌会话）。\n"
        "不要声称能执行 shell 或写业务代码。"
    )

    return create_deep_agent(
        model=model,
        tools=tools,
        system_prompt=system_prompt,
        skills=["/agent_skills/builtin/", "/data/skill_market/"],
        memory=["/memories/AGENTS.md"],
        permissions=[
            FilesystemPermission(operations=["write"], paths=["/memories/**"], mode="allow"),
            FilesystemPermission(operations=["write"], paths=["/**"], mode="deny"),
            FilesystemPermission(operations=["read"], paths=["/**"], mode="allow"),
        ],
        backend=_build_backend(deck.user_id),
        checkpointer=get_checkpointer(),
        store=get_store(),
        name="deck-coach",
    )


def _messages_from_checkpointer(thread_id: str) -> list[Any] | None:
    """Read raw messages from checkpointer. None = read failed; [] = empty thread."""
    config = {"configurable": {"thread_id": thread_id}}
    try:
        checkpointer = get_checkpointer()
        get_tuple = getattr(checkpointer, "get_tuple", None)
        if callable(get_tuple):
            tup = get_tuple(config)
            if tup is None:
                return []
            checkpoint = getattr(tup, "checkpoint", None) or {}
            values = checkpoint.get("channel_values") or {}
            return list(values.get("messages") or [])
        # Fallback: build agent and use get_state
        return None
    except Exception:  # noqa: BLE001
        logger.exception("Failed reading checkpointer for thread %s", thread_id)
        return None


def get_chat_history(
    db: Session,
    deck: Deck,
    user_id: int,
    settings: Settings | None = None,
) -> tuple[str, list[ChatMessageOut]]:
    settings = settings or get_settings()
    tid = thread_id_for(user_id, deck.id)
    config = {"configurable": {"thread_id": tid}}

    raw = _messages_from_checkpointer(tid)
    if raw is None:
        try:
            agent = _create_agent(db, deck, settings)
            state = agent.get_state(config)
            raw = list((state.values or {}).get("messages") or [])
        except Exception:  # noqa: BLE001
            logger.exception("Failed reading agent thread state")
            raw = None

    if raw:
        projected = _project_messages(raw)
        if projected:
            return tid, projected

    # Durable UI mirror (survives checkpointer/pool failures & process restarts)
    mirrored = load_transcript(db, deck.id)
    if mirrored:
        return tid, mirrored
    return tid, []


def run_deck_agent_turn(
    db: Session,
    deck: Deck,
    user_id: int,
    content: str,
    settings: Settings | None = None,
) -> tuple[list[ChatMessageOut], DeckOut, bool, str | None]:
    settings = settings or get_settings()
    if deck.user_id != user_id:
        raise PermissionError("deck ownership mismatch")

    tid = thread_id_for(user_id, deck.id)
    agent = _create_agent(db, deck, settings)
    config = {"configurable": {"thread_id": tid}}

    cards_before = {(c.card_id, c.count) for c in deck.cards}
    result = agent.invoke({"messages": [HumanMessage(content=content)]}, config=config)

    db.refresh(deck)
    cards_after = {(c.card_id, c.count) for c in deck.cards}
    patch_applied = cards_before != cards_after
    patch_error: str | None = None

    messages = result.get("messages") if isinstance(result, dict) else None
    if messages is None:
        _, projected = get_chat_history(db, deck, user_id, settings)
        return projected[-2:], serialize_deck(deck), patch_applied, patch_error

    for msg in reversed(list(messages)):
        if getattr(msg, "type", None) == "tool" or msg.__class__.__name__ == "ToolMessage":
            text = _message_text(getattr(msg, "content", ""))
            if text.startswith("错误:"):
                patch_error = text.removeprefix("错误:").strip()
                patch_applied = False
            break

    projected = _project_messages(list(messages))
    # Annotate last assistant with patch meta for UI
    if projected and projected[-1].role == "assistant":
        projected[-1] = projected[-1].model_copy(
            update={"patch_applied": patch_applied, "patch_error": patch_error}
        )

    new_msgs: list[ChatMessageOut] = []
    for m in reversed(projected):
        new_msgs.append(m)
        if len(new_msgs) >= 2:
            break
    new_msgs.reverse()
    if not new_msgs:
        new_msgs = [
            ChatMessageOut(id=1, role="user", content=content),
            ChatMessageOut(
                id=2,
                role="assistant",
                content="（无文本回复）",
                patch_applied=patch_applied,
                patch_error=patch_error,
            ),
        ]

    assistant_text = next((m.content for m in reversed(new_msgs) if m.role == "assistant"), "（无文本回复）")
    try:
        append_chat_turn(
            db,
            deck,
            user_content=content,
            assistant_content=assistant_text,
            patch_applied=patch_applied,
            patch_error=patch_error,
        )
    except Exception:  # noqa: BLE001
        logger.exception("Failed mirroring chat turn to transcript")

    return new_msgs, serialize_deck(deck), patch_applied, patch_error
