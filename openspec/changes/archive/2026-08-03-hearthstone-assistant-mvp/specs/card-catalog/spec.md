## Purpose

通过暴雪官方 API 同步并维护简中卡牌数据，支持全量牌库预览、检索筛选与卡牌详情，覆盖标准与狂野相关信息。

## ADDED Requirements

### Requirement: Sync cards from official Blizzard API
系统 MUST 使用暴雪官方 Hearthstone API 拉取卡牌及相关元数据，并写入本地可查询存储。同步 MUST 支持手动触发；同步结果 MUST 以简中（`zh_CN`）为主展示语言。

#### Scenario: Manual sync refreshes catalog
- **WHEN** 具备权限的操作触发卡牌同步且官方 API 可用
- **THEN** 系统更新本地卡牌数据，后续牌库查询反映最新同步结果

#### Scenario: Sync failure is reported
- **WHEN** 官方 API 不可用或同步过程失败
- **THEN** 系统保留既有本地数据，并返回可观察的失败状态或错误信息

### Requirement: Browse full card pool
系统 MUST 提供全量卡池预览能力，列出本地已同步的卡牌供用户浏览（不做玩家收藏过滤）。列表 MUST 在可用时展示官方卡图（热链同步得到的 `image` URL）；分页规模 MUST 适合卡图浏览（实现上约每页 20 张）。同名重印卡 MUST 可通过可读系列名与卡牌 ID 区分。

#### Scenario: User opens card library
- **WHEN** 用户打开牌库
- **THEN** 系统展示可浏览的卡牌列表（分页），有官方图的卡牌以卡图形式呈现，并标出系列与卡牌 ID

#### Scenario: Hover shows enlarged card near pointer
- **WHEN** 用户在牌库列表上将指针悬停在带官方图的卡牌上
- **THEN** 系统在指针附近展示接近详情尺寸的放大卡图预览，且预览不得因布局 transform 偏离视口或远离指针

### Requirement: Search and filter cards
系统 MUST 支持按名称关键词及常用属性筛选卡牌，至少包括费用、职业、稀有度，并支持按模式语境（标准/狂野）理解卡池相关性。

#### Scenario: Filter by cost and class
- **WHEN** 用户设置费用与职业筛选条件
- **THEN** 系统仅返回同时满足这些条件的卡牌

#### Scenario: Keyword search by name
- **WHEN** 用户输入卡牌名称关键词
- **THEN** 系统返回名称匹配的简中卡牌结果（同名不同系列的重印卡可同时出现）

### Requirement: Persist readable set labels on sync
同步卡牌时，系统 MUST 结合官方 sets 元数据（及必要回退映射）将可读系列名写入本地存储，供牌库与详情展示；不得仅依赖裸数字 `cardSetId` 作为唯一展示文案。

#### Scenario: Reprint cards show distinct sets
- **WHEN** 本地存在同名但不同 `cardSetId` 的可收藏卡（如经典与核心重印）
- **THEN** 牌库与详情展示不同的可读系列名，并保留各自卡牌 ID

### Requirement: Card detail view
系统 MUST 提供单卡详情，展示足以支持查卡与组套决策的信息，至少包括名称、费用、职业、稀有度、类型、系列、效果文本、官方卡图（若有）及与标准/狂野相关的可用性信息（以官方数据为准）。

#### Scenario: Open card detail
- **WHEN** 用户选择某张卡牌查看详情
- **THEN** 系统展示该卡的简中详情字段，包括可读系列名、卡牌 ID，以及可用时的官方卡图

#### Scenario: Unknown card id
- **WHEN** 用户请求不存在的卡牌标识
- **THEN** 系统返回未找到错误
