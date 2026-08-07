---
name: card-llm-wiki
description: >-
  炉石 card llm-wiki 总览：backend/card_wiki 布局与技能分流。
  用户笼统提到 card wiki / llm-wiki / 炉石知识库时使用，再转入具体子 skill。
---

# Card llm-wiki（总览）

知识库：`backend/card_wiki/`（先读 `SCHEMA.md`）。

| 场景 | 使用 skill |
|------|------------|
| 冷启动 / 全量薄页 | `.cursor/skills/wiki-cold-start` |
| 灌文章 / ingest | `.cursor/skills/wiki-maintain` |
| 检查一致性 | `.cursor/skills/wiki-lint` |
| 组牌会话查 wiki | 运行时 builtin `wiki-query`（非 Cursor；deepagents 只读） |

冲突：同一 `format` + `strategy_key` → 新覆盖旧。  
官方事实以卡牌目录为准；wiki 不进业务库、无百科 UI。
