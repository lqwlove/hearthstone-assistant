## ADDED Requirements

### Requirement: Coach-first conversation before building
在卡组助手阶段为 `coaching` 时，助手 MUST 以专业教练方式进行澄清与建议（追问目标、节奏、约束等），MUST NOT 要求每轮修改卡组，MUST NOT 通过任何路径应用改套。本套牌相关约束与澄清结论 MUST 保留在该卡组的对话记忆中（与对话同一套运行时记忆），不得依赖单独的卡组 brief 存储作为权威来源。用户消息与助手回复 MUST 经 Agent 运行时记忆持久化。

#### Scenario: Coaching turn does not mutate deck
- **WHEN** 阶段为 `coaching` 且用户发送构筑相关问题
- **THEN** 系统展示助手文本回复，当前卡组内容保持不变

#### Scenario: Coaching messages persisted in agent memory
- **WHEN** 用户在 `coaching` 阶段发送一条助手消息
- **THEN** 该回合被持久化到该用户该卡组的 Agent 对话记忆中，后续打开同一卡组可继续上下文

### Requirement: Building phase after explicit start
仅当卡组所有者已触发「开始组牌」使阶段为 `building` 后，助手才 MAY 通过白名单改套工具修改当前草稿。组牌操作区 MUST 在改套成功后反映最新卡组。

#### Scenario: Building turn may apply patch via tools
- **WHEN** 阶段为 `building` 且助手通过合法改套工具更新卡组
- **THEN** 系统持久化草稿变更，并在对话中保留助手回复，组牌操作区可看到更新

#### Scenario: User can keep chatting without patch in building
- **WHEN** 阶段为 `building` 且助手选择仅提供建议而不改套
- **THEN** 系统展示文本回复且卡组可保持不变

## MODIFIED Requirements

### Requirement: One conversation thread per deck
系统 MUST 为每个卡组维护恰好一条组牌助手对话 thread（按卡组所有者隔离）。打开该卡组的组牌页时 MUST 加载同一 thread 的历史。该 thread 的权威存储 MUST 为 Agent 运行时在 PostgreSQL 中的持久化记忆，而不是应用内自建聊天消息表。

#### Scenario: Continue existing thread
- **WHEN** 用户再次打开已有对话记录的卡组组牌页并发送新消息
- **THEN** 系统在既有 thread 上继续，而不是创建新的无关 thread

#### Scenario: Thread scoped to deck owner
- **WHEN** 非卡组所有者尝试读取或写入该卡组的助手对话
- **THEN** 系统拒绝访问

### Requirement: Free-form assistant conversation
系统 MUST 允许用户与组牌助手进行自由文本对话。助手 MUST NOT 被要求在每一轮都修改卡组；可以仅提供建议、解释或追问。在 `coaching` 阶段，助手 MUST 优先澄清需求；在 `building` 阶段，助手 MAY 在需求已由用户确认开组后进行改套相关操作（经白名单工具）。

#### Scenario: Advice-only reply
- **WHEN** 用户询问构筑方向且助手选择不改套
- **THEN** 系统展示助手文本回复，当前卡组内容保持不变

#### Scenario: User message persisted
- **WHEN** 用户发送一条助手消息
- **THEN** 该消息经由 Agent 运行时记忆持久化，并在随后的历史查询中可见

### Requirement: Optional structured deck patch
当且仅当阶段为 `building` 时，助手 MAY 通过系统提供的改套工具变更当前卡组草稿。若改套合法，系统 MUST 应用到草稿并在组牌操作区反映结果；若工具调用失败或引用不存在的卡牌，系统 MUST NOT 破坏既有卡组数据，并向用户表明未能应用该改套（文本回复仍可展示）。在 `coaching` 阶段，即使回复中出现类似改套指令，系统 MUST NOT 将其应用到草稿。

#### Scenario: Patch applied when present
- **WHEN** 阶段为 `building` 且助手通过合法改套工具提交可应用的改套（如设置指定卡牌数量）
- **THEN** 系统更新该卡组草稿内容，并在对话中保留助手回复

#### Scenario: Text-only reply without patch
- **WHEN** 助手回复不包含改套操作
- **THEN** 系统不修改卡组，仅展示对话文本

#### Scenario: Invalid patch ignored safely
- **WHEN** 改套工具调用无法完成或引用不存在的卡牌
- **THEN** 系统不破坏既有卡组数据，并向用户表明未能应用该改套（文本回复仍可展示）

#### Scenario: Coaching ignores embedded patch text
- **WHEN** 阶段为 `coaching` 且助手回复中出现类似改套的结构化内容
- **THEN** 系统不将任何改套应用到草稿
