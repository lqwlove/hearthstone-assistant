---
name: wiki-query
description: >-
  从 card llm-wiki 自由检索卡牌与流派建议。组牌选牌时使用：用 grep/read_file 读 wiki，
  再按思想拼套；不要依赖目录搜索工具。
---

# Wiki 查询（wiki-query）

卡牌与构筑语义都在文件系统知识库里（冷启动全库薄页 + ingest 加厚）。  
用 **`read_file` / `grep` / `glob`** 自己查，按思想自由组合；**不要编造 card_id**。

## 路径

| 内容 | 路径 |
|------|------|
| Schema | `/card_wiki/SCHEMA.md` |
| 索引 | `/card_wiki/wiki/index.md`（很大：用 grep，勿整文件读入） |
| 流派综合 | `/card_wiki/wiki/archetypes/<strategy_key>.md`（如 `zee-shaman.md`） |
| 单卡 | `/card_wiki/wiki/cards/<card_id>.md` |

当前卡组的 `format` 见会话上下文；策略键与 archetype skill 对齐（`zee-shaman`、`burn-mage`、`face-hunter`、`void-dh`、`midrange` 等）。

## 建议检索方式（可自由发挥）

1. 读匹配的 archetype skill，明确思想与 `strategy_key`。
2. 若有流派页：`read_file` `/card_wiki/wiki/archetypes/<strategy_key>.md`。
3. 在 cards 下 `grep`：
   - `standard::<strategy_key>` / `wild::<strategy_key>` 找已有建议
   - 或按 `roles:`、卡名、费用相关关键词收窄
4. `read_file` 少量相关 `cards/<card_id>.md`，看 frontmatter（`roles`、`strategies`）与正文。
5. 用真实 `card_id` 调用 `apply_deck_patch`；需要时 `get_current_deck` / `validate_current_deck`。

## 原则

- **Wiki 即卡库语义面**：全库薄页已在；缺建议时可按角色/曲线从同类页里选牌，不必另开目录搜索工具。
- **思想优先**：服务流派目标与曲线，而不是死抄某一篇参考表。
- **只读**：不要写入 `/card_wiki/`。
