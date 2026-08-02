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
系统 MUST 提供全量卡池预览能力，列出本地已同步的卡牌供用户浏览（不做玩家收藏过滤）。

#### Scenario: User opens card library
- **WHEN** 用户打开牌库
- **THEN** 系统展示可浏览的卡牌列表（分页或等价可滚动加载）

### Requirement: Search and filter cards
系统 MUST 支持按名称关键词及常用属性筛选卡牌，至少包括费用、职业、稀有度，并支持按模式语境（标准/狂野）理解卡池相关性。

#### Scenario: Filter by cost and class
- **WHEN** 用户设置费用与职业筛选条件
- **THEN** 系统仅返回同时满足这些条件的卡牌

#### Scenario: Keyword search by name
- **WHEN** 用户输入卡牌名称关键词
- **THEN** 系统返回名称匹配的简中卡牌结果

### Requirement: Card detail view
系统 MUST 提供单卡详情，展示足以支持查卡与组套决策的信息，至少包括名称、费用、职业、稀有度、类型、系列、效果文本及与标准/狂野相关的可用性信息（以官方数据为准）。

#### Scenario: Open card detail
- **WHEN** 用户选择某张卡牌查看详情
- **THEN** 系统展示该卡的简中详情字段

#### Scenario: Unknown card id
- **WHEN** 用户请求不存在的卡牌标识
- **THEN** 系统返回未找到错误
