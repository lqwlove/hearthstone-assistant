# Card Wiki Schema (llm-wiki)

知识库由 **宿主 agent** 按 `skills/` 维护与查询；内容为 markdown 文件。  
**不要**把 wiki 写入业务数据库。卡牌目录（DB/API/导出）仅作官方事实锚点。

## Layout

```
card_wiki/
  SCHEMA.md
  raw/<source_id>/
  wiki/
    index.md
    log.md
    cards/<card_id>.md
    roles/<slug>.md
    archetypes/<slug>.md
```

- Cursor 维护 skills：仓库 `.cursor/skills/{wiki-cold-start,wiki-maintain,wiki-lint,card-llm-wiki}`
- 组牌查询 skill：`agent_skills/builtin/wiki-query`（deepagents 路径 `/card_wiki/` → 本目录）

## Card page frontmatter

```yaml
---
card_id: "126662"
name: "虚空灵魂"
class_slug: demonhunter
cost: 1
card_type: minion
rarity_slug: epic
formats: [standard, wild]
roles: [engine, grow]
strategies: {}
updated_at: "2026-08-06T00:00:00+00:00"
---
```

### `strategies` map

Key = `{format}::{strategy_key}`，例如 `standard::void-dh`。

```yaml
standard::void-dh:
  advice: "核心成长引擎；优先保留双份。"
  source_id: "article-2026-08-01"
  updated_at: "2026-08-06T12:00:00+00:00"
```

## Conflict rule

**同一 `format` + 同一 `strategy_key`：新建议覆盖旧建议**（整段替换，并更新 `source_id` / `updated_at`）。  
不同 strategy_key 并存。

## Workflows（细节见 skills）

| Skill | 角色 | 位置 |
|-------|------|------|
| `wiki-cold-start` | 目录快照 → 薄页 + 重建 index | `.cursor/skills/` |
| `wiki-maintain` | 原文进 raw → 理解后更新 wiki + log | `.cursor/skills/` |
| `wiki-lint` | 检查 frontmatter / card_id / index | `.cursor/skills/` |
| `wiki-query` | 组牌时只读检索 | `agent_skills/builtin/` |

软校验：写入或引用的 `card_id` 必须出现在宿主目录快照/工具结果中；未知 id 丢弃。
