---
name: wiki-cold-start
description: >-
  炉石 card wiki 冷启动：从目录快照生成全库薄页 markdown 并重建 index。
  用户说冷启动、生成薄页、全量卡牌 wiki、export catalog 后写 pages 时使用。
---

# Wiki 冷启动（wiki-cold-start）

先读 `backend/card_wiki/SCHEMA.md`，再执行。

## 输入

优先读：

- `backend/card_wiki/raw/_catalog/cards.jsonl`（每行 JSON：`id`/`card_id`, `name`, `cost`, `class_slug`, `card_type`, `rarity_slug`, `text`, `is_standard`, `is_wild`）
- 若无快照：在 `backend/` 执行 `uv run python scripts/export_card_catalog.py`（无 LLM）

若仍无快照：停止并告知用户，**不要编造 card_id**。

## 步骤

1. 确保 `backend/card_wiki/wiki/{cards,roles,archetypes}/` 存在。
2. 对每张可收集牌写/覆盖 `wiki/cards/<card_id>.md`：  
   事实 frontmatter + 启发式 `roles` + `strategies: {}` + 薄正文（官方文本注明以目录为准）。
3. 重建 `wiki/index.md`（按 `class_slug` 索引）。
4. 追加 `wiki/log.md`：`ISO时间 | cold-start | catalog | wrote N pages`。

## 原则

- 薄页即可；strategy 留给 `wiki-maintain`。
- 全量数千张用脚本批量写，勿逐张手工粘贴。
- 你就是维护者，不另配模型 Key。
