# deck-building Specification

## Purpose

支持用户在标准/狂野下创建与编辑卡组：草稿可随时保存，最终保存必须通过构筑规则校验，并提供独立三栏组牌工作台。

## Requirements

### Requirement: Create and list user decks
系统 MUST 允许已登录用户创建卡组（指定名称、职业、模式：标准或狂野）并查看自己的卡组列表。用户 MUST NOT 看到或修改其他用户的卡组。

#### Scenario: Create a deck
- **WHEN** 已登录用户提交名称、职业与模式创建卡组
- **THEN** 系统创建属于该用户的卡组并出现在其列表中

#### Scenario: Deck isolation by user
- **WHEN** 用户 A 尝试读取或修改用户 B 的卡组
- **THEN** 系统拒绝该操作

### Requirement: Draft save allowed while incomplete or illegal
系统 MUST 允许将当前卡组内容保存为草稿，即使尚未满 30 张或不满足构筑规则。草稿 MUST 可被再次打开并继续编辑。

#### Scenario: Save incomplete draft
- **WHEN** 用户在卡组未满 30 张时保存草稿
- **THEN** 系统持久化当前卡牌列表并标记为草稿状态

#### Scenario: Resume draft editing
- **WHEN** 用户打开已保存的草稿卡组
- **THEN** 系统恢复先前的卡牌列表与元数据供继续编辑

### Requirement: Finalize requires rule validation
系统 MUST 提供「最终保存」操作；仅当卡组通过构筑规则校验时才可标记为已完成。校验失败时 MUST 返回具体违规项，且不得将卡组标记为已完成。

#### Scenario: Finalize legal thirty-card deck
- **WHEN** 用户对满足全部构筑规则且恰好 30 张的卡组执行最终保存
- **THEN** 系统将卡组标记为已完成并持久化

#### Scenario: Finalize rejected with violations
- **WHEN** 用户对存在违规（如张数不对、职业不符、超额同名、模式不合法等）的卡组执行最终保存
- **THEN** 系统拒绝最终保存，返回违规说明，卡组保持可继续编辑的草稿（或未完成）状态

### Requirement: Constructed deck rules
对于标准与狂野构筑卡组，校验 MUST 至少强制执行：恰好 30 张；仅可包含该卡组职业与中立卡；同一卡牌普通最多 2 张、传说最多 1 张；每张卡在所选模式（标准/狂野）下合法。复杂特殊规则（如侧次职业等）可在后续迭代补充，但不得削弱上述基线。

#### Scenario: Legendary copy limit
- **WHEN** 用户尝试将同一张传说卡加入超过 1 张
- **THEN** 系统在最终保存时将其判为违规（组牌过程中可作为草稿保留，但完成时失败）

#### Scenario: Wrong class card illegal
- **WHEN** 卡组中包含非本职业且非中立的卡牌
- **THEN** 最终保存校验失败并指出职业违规

#### Scenario: Format-illegal card in standard
- **WHEN** 标准模式卡组包含不在当前标准合法范围内的卡牌
- **THEN** 最终保存校验失败并指出模式合法性违规

### Requirement: Dedicated three-column deck builder page
系统 MUST 提供独立的组牌页面（进入后不展示全局左侧导航），布局为：左侧可选牌池（含检索/筛选并可将卡加入卡组）、中间组牌操作区（当前卡组列表、增减张数、张数与校验状态）、右侧为组牌助手对话区（见 `deck-assistant`）。

#### Scenario: Open builder layout
- **WHEN** 用户进入某卡组的组牌页
- **THEN** 页面呈现左牌池、中操作区、右对话区三栏，且不显示全局左侧菜单

#### Scenario: Add card from pool to deck
- **WHEN** 用户在左侧牌池选择一张可加入的卡
- **THEN** 中间卡组列表更新以反映该卡的加入或张数增加
