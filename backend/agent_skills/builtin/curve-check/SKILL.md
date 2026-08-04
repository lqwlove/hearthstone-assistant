---
name: curve-check
description: 曲线与过牌检查工作流：评估费阶分布、起手与中后程断档，并给出可执行的换牌建议方向。
---

# 曲线检查（curve-check）

在 `building` 阶段可调用 `get_current_deck` 与 `search_cards`：

1. 统计 0–2 / 3–4 / 5+ 费数量是否符合目标节奏
2. 指出断档或过重曲线
3. 给出 2～3 个具体换牌方向（卡名或费阶），需要改套时用 `apply_deck_patch`
