from __future__ import annotations

import uuid
from typing import Any

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import (
    AIMessage,
    AIMessageChunk,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult
from pydantic import Field


def _as_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text", "")))
            elif isinstance(block, str):
                parts.append(block)
        return "\n".join(parts)
    return str(content)


class MockCoachModel(BaseChatModel):
    """Deterministic model for tests / no-API-key local runs."""

    bound_tools: list[Any] = Field(default_factory=list)
    sample_card_id: str = "1000"

    @property
    def _llm_type(self) -> str:
        return "mock-coach"

    def bind_tools(self, tools: Any, **kwargs: Any) -> MockCoachModel:  # noqa: ANN401
        return self.model_copy(update={"bound_tools": list(tools)})

    def _phase_from_messages(self, messages: list[BaseMessage]) -> str:
        for m in messages:
            if isinstance(m, SystemMessage):
                text = _as_text(m.content)
                if "phase=building" in text:
                    return "building"
                if "phase=coaching" in text:
                    return "coaching"
        return "coaching"

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        del stop, run_manager, kwargs
        if messages and isinstance(messages[-1], ToolMessage):
            content = "已根据工具结果完成这一轮。若还需调整，请继续说明。"
            return ChatResult(
                generations=[ChatGeneration(message=AIMessage(content=content))]
            )

        user_text = ""
        for m in reversed(messages):
            if isinstance(m, HumanMessage):
                user_text = _as_text(m.content)
                break

        phase = self._phase_from_messages(messages)
        wants_patch = any(
            k in user_text
            for k in ("改套", "加入", "patch", "加一张", "加上", "开始组")
        )
        tool_names = {getattr(t, "name", None) for t in self.bound_tools}

        if wants_patch and "apply_deck_patch" in tool_names:
            args = {
                "ops": [
                    {"op": "set_count", "card_id": self.sample_card_id, "count": 1}
                ],
            }
            msg = AIMessage(
                content="正在通过改套工具更新草稿。",
                tool_calls=[
                    {
                        "name": "apply_deck_patch",
                        "args": args,
                        "id": f"call_{uuid.uuid4().hex[:12]}",
                        "type": "tool_call",
                    }
                ],
            )
            return ChatResult(generations=[ChatGeneration(message=msg)])

        if "偏好" in user_text and "edit_file" in tool_names:
            msg = AIMessage(
                content="记下你的偏好。",
                tool_calls=[
                    {
                        "name": "edit_file",
                        "args": {
                            "file_path": "/memories/AGENTS.md",
                            "old_string": "",
                            "new_string": f"# User prefs\n- note: {user_text[:200]}\n",
                        },
                        "id": f"call_{uuid.uuid4().hex[:12]}",
                        "type": "tool_call",
                    }
                ],
            )
            return ChatResult(generations=[ChatGeneration(message=msg)])

        if phase == "coaching" and not wants_patch:
            content = (
                "【澄清】先确认目标：想打什么节奏（快攻/中速/控制）或具体流派？"
                "有没有禁卡或必带卡？信息够了我就会直接往卡组里加牌。"
            )
        else:
            content = "可以说想加/换/删哪张牌；我会用改套工具增量更新草稿。"

        return ChatResult(
            generations=[ChatGeneration(message=AIMessage(content=content))]
        )

    def _stream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ):
        result = self._generate(messages, stop=stop, run_manager=run_manager, **kwargs)
        msg = result.generations[0].message
        content = _as_text(getattr(msg, "content", ""))
        tool_calls = getattr(msg, "tool_calls", None) or []
        # Stream text in small chunks for UI streaming demos
        step = 6 if content else 0
        for i in range(0, len(content), step or 1) if content else []:
            piece = content[i : i + step]
            yield ChatGenerationChunk(message=AIMessageChunk(content=piece))
        if tool_calls:
            yield ChatGenerationChunk(
                message=AIMessageChunk(content="", tool_calls=tool_calls)
            )
        if not content and not tool_calls:
            yield ChatGenerationChunk(message=AIMessageChunk(content=""))

    async def _agenerate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        return self._generate(messages, stop=stop, run_manager=run_manager, **kwargs)

    async def _astream(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ):
        for chunk in self._stream(
            messages, stop=stop, run_manager=run_manager, **kwargs
        ):
            yield chunk
