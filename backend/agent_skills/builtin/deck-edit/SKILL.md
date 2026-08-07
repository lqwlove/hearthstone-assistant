---
name: deck-edit
description: 通用改套：archetype 思想 + wiki-query 查牌，自由拼满 30 张后 patch。无目录搜索工具。
---

# 改套工作流（deck-edit）

## 流程

1. 澄清够用后（`coach-intake`），读匹配的 archetype skill，弄清思想与角色缺口。
2. 按 **wiki-query** skill：在 `/card_wiki/wiki/` 用 `grep` / `read_file` 查牌与建议（可先看 `archetypes/`）。
3. 按思想自由选牌、凑曲线；`card_id` 必须来自 wiki 页或用户给出。
4. `apply_deck_patch`；需要时 `get_current_deck` / `validate_current_deck`。
5. **组满合法 30 张**；不够就继续在 wiki 里按角色/费用挖，再与用户微调。

## 原则

- **思想优先**，参考表与 wiki 建议都可替换为同角色更贴曲线的牌。
- **禁止编造 ID**。
- **无 search_cards**：查牌走 wiki-query（文件系统），不要假设有目录搜索工具。
