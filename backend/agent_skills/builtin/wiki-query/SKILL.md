---
name: wiki-query
description: 从 card llm-wiki 查询卡牌/流派建议。先读 index，再打开少量 pages；拿真实 card_id 后再改套。
---

# Wiki 查询（wiki-query）

知识库路径：`/card_wiki/wiki/`（约定见 `/card_wiki/SCHEMA.md`）。  
**官方费用/文本/是否标准以宿主卡牌目录为准**；wiki 提供角色与流派建议。

组牌 agent **只加载本 skill**；冷启动 / ingest / lint 由 Cursor 项目 skill `card-llm-wiki` 或其它可写 agent 执行，不要在组牌会话里改 wiki 文件。

## 流程

1. 读 `/card_wiki/wiki/index.md`，按职业与角色缩小范围。
2. 打开少量相关页：`/card_wiki/wiki/cards/<card_id>.md`（或 `roles/` / `archetypes/`）。
3. 看 frontmatter：
   - `roles`
   - `strategies.<format>::<strategy_key>`（新文章会覆盖同槽旧 advice）
4. 确认适合当前 format 与思想后，再用宿主改套工具（如 `apply_deck_patch` / `search_cards`）。
5. **不要**把 wiki 当作封闭卡池。

## 优先级（与 deck-edit 一致）

archetype skill 思想 → wiki 建议 → catalog search 补位 → validate / patch。
