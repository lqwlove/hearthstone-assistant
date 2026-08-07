## Why

组牌 agent 已能按 archetype 思想与 `search_cards` 补位，但仍缺少可复利的「构筑语义层」。采用 Karpathy **llm-wiki** 模式：agent 阅读原文、编译进持久化的 markdown 知识库，并在后续 ingest 中维护更新——**不把 wiki 写入业务数据库，也无用户百科页面**。

## What Changes

- 知识库本体：`backend/card_wiki/` = `SCHEMA` + `raw/` + `wiki/`
- Cursor 维护 skills：`.cursor/skills/{wiki-cold-start,wiki-maintain,wiki-lint,card-llm-wiki}`
- 组牌只读：`agent_skills/builtin/wiki-query`
- **不依赖单独配置的模型 Key / maintainer 微服务**（由 Cursor / 宿主 agent 执行）
- 冷启动：agent 读宿主目录快照（如 `raw/_catalog/cards.jsonl`）写薄页
- Ingest：agent 落盘 raw → 理解 → 更新 wiki；同一模式 + 同一牌组策略下新覆盖旧
- 本仓库 deepagents：挂载 `/card_wiki/` 只读；组牌 coach **仅** `wiki-query`（builtin）；维护走 Cursor 项目 skill
- **明确不做**：wiki 进业务库；百科 UI；带 API Key 的 Python maintainer CLI

### Non-goals

- 不做 wiki 的 DB 表 / ORM 镜像
- 不做前端百科/知识库 UI
- 不替代 Blizzard 卡牌同步与构筑校验
- 不做「另起一套 LLM_PROVIDER Key」的 ingest 服务
- MVP 不做人工审批流

## Capabilities

### New Capabilities

- `card-wiki`: 可搬运 llm-wiki pack（布局、skills、冲突规则）及与卡牌目录事实边界

### Modified Capabilities

- `deck-assistant`: 组牌 agent 经 `wiki-query` 读 wiki，与 archetype / search_cards / apply_deck_patch 协同

## Impact

- Backend：`backend/card_wiki/` pack；可选宿主适配 `export_card_catalog.py`（仅导出 jsonl，无 LLM）
- deepagents 挂载 + skills 路径
- **无** 新业务表；**无** 前端页面
