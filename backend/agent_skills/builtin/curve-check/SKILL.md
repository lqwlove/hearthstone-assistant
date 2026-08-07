---
name: curve-check
description: 曲线与过牌检查：对照 archetype 思想与费阶目标评估草稿，再按 deck-edit 搜库调整。
---

# 曲线检查（curve-check）

1. 若目标匹配 archetype skill，先 `read_file` 该 skill，取其曲线目标与角色思想（不必拘泥参考卡表）。
2. `get_current_deck`，按 0–2 / 3–4 / 5+ 统计张数，对照目标。
3. 指出断档或过重；缺位用 `search_cards` 按费用与角色关键词找替代牌。
4. 改套步骤遵循 `deck-edit`，直到曲线合理、张数合法。
