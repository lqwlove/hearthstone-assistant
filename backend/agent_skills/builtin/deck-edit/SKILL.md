---
name: deck-edit
description: 通用改套工作流：用 archetype skill 的 card_id 与工具改草稿。组牌、加卡、删卡、换卡、校验时使用；archetype skill 只提供流派卡池，不重复本流程。
---

# 改套工作流（deck-edit）

适用于所有流派。archetype skill 只提供目标与卡池；**怎么改套看本 skill**。

## 流程

1. 澄清够用后（见 `coach-intake`），`read_file` 匹配的 archetype skill。
2. 只用已读 skill 表内的 `card_id`（及用户明确给出的 ID）。
3. 确定可加入/删除/调整的牌 → 立刻 `apply_deck_patch`（`count=0` 删除）。
4. 需要时 `get_current_deck` / `validate_current_deck`；中间态可不满 30。
5. 和用户继续迭代，直到合法成套。

## 约束

- **禁止搜卡**：没有 `search_cards`；缺卡就问用户或换 skill 内替代，不要编造 ID。
- **一次改多少自定**：符合构筑规则即可，无需分批配额。
- **无需「开始组牌」按钮**：信息够了就改套。
