## Context

See `proposal.md` for motivation. Today `backend/app/services/llm.py` does a single chat completion and `assistant.py` regex-extracts JSON patches. Deck validation and card catalog already exist and should be reused as tools. Product decisions from exploration: Deep Agents harness, coach-first with explicit「开始组牌」, skills-first with builtin packs, skill market as public pool (submit → review → agent-loadable), no subscriptions.

## Goals / Non-Goals

**Goals:**
- Replace the single-LLM path with Deep Agents wired into the existing per-deck chat API
- Enforce `coaching` / `building` in the backend (not only in prompts)
- Ship a small whitelist of deck tools + a few builtin workflow skills
- Define skill-pack storage/review so market-published packs join the same load path as builtins
- **本期必做双层记忆（不可推迟）**：
  1. 对话 thread（含本套牌澄清）→ Postgres checkpointer，`thread_id` 含 `user_id`+`deck_id`
  2. 用户长期偏好（跨卡组）→ PostgresStore + Deep Agents memory，namespace 含 `user_id`
- 历史 API 与 Agent invoke 均以 Deep Agents/Postgres 为权威；废弃自建 `chat_*` 记忆路径

**Non-Goals:**
- Subscription/follow/payment (see proposal)
- Exposing Deep Agents filesystem/shell/default coding tools to the model
- Full marketplace UI polish in the first implementation slice (API + minimal submit path is enough if UI follows)
- 独立卡组 brief 表（套牌约束留在对话 thread 内）

## Decisions

### D1: Deep Agents as harness
- **Choice**: `deepagents.create_deep_agent` for deck-assistant turns; LangGraph runtime for durability/streaming later if needed.
- **Rationale**: Native skills progressive disclosure, tool loop, summarization; model-provider flexible via LangChain model strings.
- **Alternatives**: Hand-rolled tool loop (less skills DX); Claude Agent SDK (Claude-locked).

### D2: Strip non-deck harness surface
- **Choice**: Exclude default filesystem write/shell tools via harness profile / middleware allowlists; only pass deck whitelist tools.
- **Rationale**: Coach product must not look like a coding agent; reduces risk and prompt noise.

### D3: Phase stored per deck (thin app state)
- **Choice**: Persist `assistant_phase` as `coaching` | `building` keyed by `deck_id` (small column/table or deck field—not a parallel chat log). Default `coaching`. API: `POST .../chat/start-building` (optional return-to-coaching). Patch tool checks phase server-side.
- **Rationale**: Button is product truth; model cannot bypass. Phase is control state, not “memory”.
- **Alternatives**: Prompt-only gate (too weak).

### D4: Tools wrap existing domain services
- **Choice**: Tools call into existing `validate_deck`, card list queries, and a tightened apply-patch path (evolve today’s `apply_deck_patch`). Stop applying patches from raw assistant text in coaching; in building, prefer tool calls as the only mutate path.
- **Rationale**: Keep rules engine authoritative; avoid duplicate logic.

### D5: Skills layout
- **Choice**: Repo builtins under e.g. `backend/agent_skills/builtin/*/SKILL.md`. Published market packs materialized to a store backend path or DB-backed virtual FS that Deep Agents can read. First builtins: `coach-intake`, plus 1–2 archetype/workflow skills.
- **Rationale**: Skills-first product narrative; progressive disclosure keeps prompts lean.

### D6: Skill market without subscription
- **Choice**: Tables for pack metadata + version + status (`pending` / `approved` / `rejected` / `unpublished`); on approve, pack becomes part of the global agent skill root. Submit API for authenticated users; approve path can be env-token admin initially.
- **Rationale**: Matches “submit to market, agent can call” without subscription complexity.
- **Alternatives**: Subscribe-then-load (deferred).

### D7: Security boundary for UGC skills
- **Choice**: Validate uploads as markdown/static assets only; reject executables; never let packs register tools. Size limits + malware-ish extension denylist.
- **Rationale**: Skills are prompt knowledge only.

### D8: API compatibility
- **Choice**: Keep `GET/POST /decks/{id}/chat` shape for the UI; history/send are backed by Deep Agents thread state (not `chat_messages`). Extend responses with `phase`; add start-building endpoint.

### D9: All agent memory via Deep Agents + Postgres (replace legacy chat tables)
- **Choice**: **Do not** keep the existing `chat_threads` / `chat_messages` (or parallel “deck brief”) as the memory system. Conversation + 卡组相关澄清内容都落在 Deep Agents / LangGraph 记忆里；按用户隔离；持久化到 **PostgreSQL**。
- **Mapping**:
  - **Thread / 对话记忆（含本套牌讨论与约束）**: LangGraph **Postgres checkpointer**（`PostgresSaver` / async 变体）。`thread_id = f"user:{user_id}:deck:{deck_id}"`（必须带 `user_id`，防止串线）。卡组目标、节奏、禁卡等澄清结果直接留在该 thread 的对话状态中，不再单独做 L2 brief 表。
  - **用户长期记忆（跨卡组偏好）**: LangGraph **PostgresStore** + Deep Agents `memory` / `StoreBackend`，namespace 按 `user_id` 划分（如 `("memories", user_id)` 或 per-user `AGENTS.md` 路径）。全局教练人设可用只读 builtin memory 文件；可写长期偏好只写当前用户 namespace。
  - **Skills**: 仍是知识包，不是记忆；与 memory 分开。
- **History API**: `GET .../chat` 从 checkpointer 读该 thread 的消息投影给前端，不再读 `chat_messages`。
- **Migration**: 新实现启用后停止写入旧表；可选一次性丢弃/归档旧聊天数据（无双写）。
- **Alternatives rejected**: 自建消息表 + Deep Agents 双写（复杂且易不一致）；仅 AGENTS.md 无 checkpointer（丢多轮对话）。

## Risks / Trade-offs

- **[Deep Agents dependency weight / version churn]** → Pin version; isolate behind `app/services/deck_agent/`; keep mock/provider path for tests.
- **[Latency & cost of tool loops]** → Limit tool rounds; coaching turns should rarely need tools; rely on Deep Agents summarization for long threads.
- **[Toxic or low-quality market skills]** → Mandatory review before `approved`; builtin namespace always wins on id conflict.
- **[BREAKING: old JSON-in-text patch + SQL chat history]** → Clients read history from new API backed by checkpointer; stop dual-writing `chat_messages`.
- **[Postgres checkpointer/store schema]** → Use official LangGraph Postgres saver/store `setup()` once; share DB with app or dedicated schema; document in README.
- **[Cross-user leak]** → `thread_id` and store namespace always include authenticated `user_id`; API still checks deck ownership before any invoke.

## Migration Plan

1. Provision LangGraph Postgres checkpointer + store (`setup()`); wire connection from existing `DATABASE_URL` or dedicated DSN.
2. Add phase field/API; default `coaching`.
3. Replace chat send/history to Deep Agents invoke + checkpointer; remove dependency on `chat_messages` writes.
4. Builtin skills → market submit/approve pool.
5. Rollback: feature-flag to previous LLM path only as emergency; expect chat history discontinuity if rolled back after cutover.

## Open Questions

- Minimal market UI in v1 vs API-only submit for authors (can decide at apply time without changing requirements).
- Whether `return-to-coaching` is required in first UI slice (spec allows MAY；API 侧本期实现，UI 可后置).

**Resolved:** 用户长期记忆与对话 checkpointer **均在本期实现**，不得砍成「仅 thread」。
