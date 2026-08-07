---
name: deck-edit
description: 通用改套工作流：抽离 archetype 思想组满 30 张。参考 skill 卡表，必要时 search_cards 补位；卡表不是封闭卡池。
---

# 改套工作流（deck-edit）

适用于所有流派。archetype skill 提供**目标、曲线与思想**；其中的卡牌表只是范例，不是唯一可用牌。

## 流程

1. 澄清够用后（见 `coach-intake`），`read_file` 匹配的 archetype skill，先读懂**流派思想与角色缺口**（启动 / 过牌 / 解场 / 斩杀等）。
2. 用 `wiki-query`：读 `/card_wiki/wiki/index.md`，再打开相关 `cards/<card_id>.md`，参考 `strategies.<format>::<strategy_key>` 与 roles（wiki 不是封闭卡池）。
3. 优先用 skill 参考表与 wiki 里合适的 `card_id` 落地核心引擎。
4. 参考表/wiki 不够、曲线有缺口、或要凑满 30 张时：用 `search_cards`（当前职业+中立、当前模式）按**角色/费用/关键词**找牌，取返回的 `card_id`。
5. `apply_deck_patch` 写入；需要时 `get_current_deck` / `validate_current_deck`。
6. **必须能组到合法 30 张**：不要因为参考表用完就停手甩给用户；继续按思想搜库补齐，再与用户迭代微调。

## 原则

- **思想优先**：问「这张牌是否服务流派目标与曲线」，而不是「是否出现在 skill 表里」。
- **参考表非封闭**：skill 列表可借鉴，也可替换为同角色、更贴曲线的牌。
- **禁止编造 ID**：只能用 search_cards / skill 表 / 用户明确给出的 ID。
- **一次改多少自定**：符合构筑规则即可。
- **无需「开始组牌」按钮**：信息够了就改套。
