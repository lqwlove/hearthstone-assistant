from __future__ import annotations

import json
from typing import Any

import httpx

from app.config import Settings


class LlmError(Exception):
    pass


SYSTEM_PROMPT = """你是炉石传说组牌助手，使用简体中文回复。
你可以自由讨论构筑思路、解释卡牌、追问需求。
当你认为需求足够清晰并需要改动当前卡组时，可在回复末尾附加一个 JSON 代码块，格式如下：
```json
{"ops":[{"op":"set_count","card_id":"123","count":2}]}
```
op 目前支持 set_count（将某卡数量设为 0-2；传说建议最多 1）。
若不需要改套，不要输出该 JSON 块。
当前卡组摘要与可选牌信息会附在用户消息上下文中。"""


async def generate_assistant_reply(
    settings: Settings,
    history: list[dict[str, str]],
    user_message: str,
    deck_context: str,
) -> str:
    provider = (settings.llm_provider or "mock").lower()
    messages = [{"role": "system", "content": SYSTEM_PROMPT + "\n\n" + deck_context}]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    if provider == "mock":
        return _mock_reply(user_message, deck_context)
    if provider == "openai":
        return await _openai_compatible(settings, messages)
    if provider == "claude":
        return await _claude(settings, messages)
    raise LlmError(f"不支持的 LLM_PROVIDER: {provider}")


def _mock_reply(user_message: str, deck_context: str) -> str:
    # Deterministic helper for local/E2E without external keys.
    if "改套" in user_message or "加入" in user_message or "patch" in user_message.lower():
        # Try to extract a card id from context line "id=..."
        card_id = None
        for line in deck_context.splitlines():
            if line.startswith("sample_card_id="):
                card_id = line.split("=", 1)[1].strip()
                break
        if card_id:
            patch = {"ops": [{"op": "set_count", "card_id": card_id, "count": 2}]}
            return (
                "好的，我先帮你把示例卡放到 2 张，你可以继续手改。\n\n"
                f"```json\n{json.dumps(patch, ensure_ascii=False)}\n```"
            )
    return (
        "我可以帮你梳理曲线、解场和胜利条件。"
        "告诉我职业、模式和想要的风格（快攻/中速/控制），需求清晰后我再给出具体改套。"
        f"\n\n你刚才说：{user_message}"
    )


async def _openai_compatible(settings: Settings, messages: list[dict[str, str]]) -> str:
    if not settings.llm_api_key:
        raise LlmError("未配置 LLM_API_KEY")
    base = (settings.llm_base_url or "https://api.openai.com/v1").rstrip("/")
    url = f"{base}/chat/completions"
    payload = {
        "model": settings.llm_model,
        "messages": messages,
        "temperature": 0.4,
    }
    headers = {"Authorization": f"Bearer {settings.llm_api_key}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
    if resp.status_code >= 400:
        raise LlmError(f"OpenAI 兼容接口调用失败: HTTP {resp.status_code} {resp.text[:300]}")
    data = resp.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LlmError("OpenAI 兼容接口响应格式异常") from exc


async def _claude(settings: Settings, messages: list[dict[str, str]]) -> str:
    if not settings.llm_api_key:
        raise LlmError("未配置 LLM_API_KEY")
    base = (settings.llm_base_url or "https://api.anthropic.com").rstrip("/")
    url = f"{base}/v1/messages"
    system = ""
    claude_messages: list[dict[str, Any]] = []
    for m in messages:
        if m["role"] == "system":
            system += m["content"] + "\n"
        else:
            role = "assistant" if m["role"] == "assistant" else "user"
            claude_messages.append({"role": role, "content": m["content"]})
    payload = {
        "model": settings.llm_model or "claude-3-5-sonnet-latest",
        "max_tokens": 2048,
        "system": system.strip(),
        "messages": claude_messages,
    }
    headers = {
        "x-api-key": settings.llm_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
    if resp.status_code >= 400:
        raise LlmError(f"Claude 接口调用失败: HTTP {resp.status_code} {resp.text[:300]}")
    data = resp.json()
    try:
        parts = data["content"]
        texts = [p.get("text", "") for p in parts if p.get("type") == "text"]
        return "\n".join(texts).strip()
    except (KeyError, TypeError) as exc:
        raise LlmError("Claude 接口响应格式异常") from exc
