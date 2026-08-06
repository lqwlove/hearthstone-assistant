---
name: curve-check
description: 曲线与过牌检查：对照 archetype skill 的费阶目标评估当前草稿，再按 deck-edit 调整。
---

# 曲线检查（curve-check）

1. 若目标匹配 archetype skill，先 `read_file` 该 skill，取其曲线目标与核心卡池。
2. `get_current_deck`，按 0–2 / 3–4 / 5+ 统计张数，对照 skill 目标。
3. 指出断档或过重，给出可执行替换（优先用 skill 内 card_id）。
4. 改套步骤遵循 `deck-edit`。
