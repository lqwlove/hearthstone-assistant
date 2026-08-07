---
name: wiki-lint
description: >-
  检查炉石 card wiki 的 frontmatter、card_id 与 index 一致性。
  用户说 lint wiki、检查知识库、校验卡页时使用。
---

# Wiki Lint（wiki-lint）

对照 `backend/card_wiki/SCHEMA.md` 与目录快照（若有 `backend/card_wiki/raw/_catalog/cards.jsonl`）。

## 检查项

1. `wiki/cards/*.md` 是否有 YAML frontmatter  
2. `card_id` 是否与文件名一致  
3. `card_id` 是否存在于目录快照（有快照时）  
4. `wiki/index.md` 非空，且尽量覆盖已有卡片  
5. `strategies` 键是否为 `format::strategy_key` 形态  

## 输出

列出 `code | path | message`。明显可修则修；不确定只报告。
